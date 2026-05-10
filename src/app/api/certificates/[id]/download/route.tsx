import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { format } from "date-fns";
import { USER_ROLES } from "@/lib/constants";
import crypto from "crypto";

// Fetches an image and returns it as a base64 data-URI for @react-pdf/renderer.
// fetch() is used instead of fs.readFile because Vercel's runtime has a
// read-only filesystem — only /tmp is writable and public/ assets are not
// accessible via process.cwd() at runtime.
async function fetchToBase64(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;

  try {
    let url: string;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      url = src;
    } else {
      // Leading "/" → public static asset served by Next.js
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      url = base.replace(/\/$/, "") + (src.startsWith("/") ? src : `/${src}`);
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[certificate-pdf] Failed to fetch asset ${url}: HTTP ${res.status}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";
    const mime = contentType.split(";")[0].trim();
    return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch (err) {
    console.error(`[certificate-pdf] Error fetching asset "${src}":`, err);
    return null;
  }
}

const G           = "#0F6E56";
const G_PILL_BG   = "#E1F5EE";
const GREY_MID    = "#6b7280";
const GREY_LINE   = "#d1d5db";
const GREY_FAINT  = "#9ca3af";
const DARK        = "#111827";
const BODY_TEXT   = "#374151";

export const dynamic = "force-dynamic";

// Vercel Pro required for maxDuration > 10.
// PDF generation + R2 image fetches routinely take 10–20s.
// See: https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 60; // seconds — PDF generation can take 10–20s

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // H12: 20 downloads per hour per user — enough for legitimate re-downloads
  // while preventing bulk scraping of certificates.
  const rl = await rateLimit(session.user.id, "cert-download", { limit: 20, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many download requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.AUDITOR];
  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  const [cert, directorNameSetting, directorSigSetting] = await Promise.all([
    db.certificate.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true } },
        scheme: true,
        decision: {
          include: {
            certificationOfficer: {
              select: { firstName: true, lastName: true, signatureUrl: true },
            },
          },
        },
      },
    }),
    db.platformSetting.findUnique({ where: { key: "cert_director_name" } }),
    db.platformSetting.findUnique({ where: { key: "cert_director_signature_url" } }),
  ]);

  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

  if (!isAdmin && cert.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ISO 17024 Cl.7.6 — suspended/revoked certs cannot be downloaded by the holder.
  if (!isAdmin && cert.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Certificate is not active (status: ${cert.status}). Download is unavailable.` },
      { status: 403 },
    );
  }

  const holderName = `${cert.user.firstName} ${cert.user.lastName}`;
  const issuedDate = format(cert.issuedAt, "d MMMM yyyy");
  const expiresDate = cert.expiresAt ? format(cert.expiresAt, "d MMMM yyyy") : "No Expiry";

  // SHA-256 integrity fingerprint embedded in PDF keywords for tamper evidence.
  const integrityPayload = `${cert.certificateNumber}|${cert.issuedAt.toISOString()}|${holderName}|${cert.scheme.code}`;
  const integrityHash = crypto.createHash("sha256").update(integrityPayload).digest("hex");

  // Fetch all images as base64 data-URIs. Each is wrapped independently so a
  // missing asset degrades gracefully rather than aborting the whole PDF.
  const [logoSrc, officerSigSrc, directorSigSrc] = await Promise.all([
    fetchToBase64("/truemark-logo.png"),
    fetchToBase64(cert.decision.certificationOfficer.signatureUrl),
    fetchToBase64(directorSigSetting?.value ?? null),
  ]);
  const officerName = `${cert.decision.certificationOfficer.firstName} ${cert.decision.certificationOfficer.lastName}`;
  const directorName = directorNameSetting?.value ?? "Director of Certification";

  // Dynamic import — defers the ~2 MB @react-pdf/renderer module until
  // after auth, rate limiting, and DB checks have passed.
  const { renderToBuffer, Document, Page, View, Text, StyleSheet, Image } =
    await import("@react-pdf/renderer");

  // A4 landscape ≈ 841 × 595 pts.
  // Corner blocks proportional to SVG design (140/800 × 841 ≈ 147, 140/580 × 595 ≈ 144).
  const CW = 147; // corner block width
  const CH = 144; // corner block height

  const styles = StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      backgroundColor: "#ffffff",
      flexDirection: "column",
    },

    // ── Corner decorations (absolute, behind all content) ────────────────────
    cornerTL: { position: "absolute", top: 0, left: 0, width: CW, height: CH, backgroundColor: G },
    cornerTR: { position: "absolute", top: 0, right: 0, width: CW, height: CH, backgroundColor: G },
    cornerBL: { position: "absolute", bottom: 0, left: 0, width: CW, height: CH, backgroundColor: G },
    cornerBR: { position: "absolute", bottom: 0, right: 0, width: CW, height: CH, backgroundColor: G },

    // ── Double border (absolute) ─────────────────────────────────────────────
    outerBorder: {
      position: "absolute",
      top: 8, left: 8, right: 8, bottom: 8,
      borderWidth: 1.5, borderColor: G, borderStyle: "solid",
    },
    innerBorder: {
      position: "absolute",
      top: 18, left: 18, right: 18, bottom: 18,
      borderWidth: 0.5, borderColor: G, borderStyle: "solid",
      opacity: 0.4,
    },

    // ── Content wrapper (keeps text clear of corner blocks) ──────────────────
    contentWrap: {
      flex: 1,
      paddingTop: 30,
      paddingBottom: 22,
      paddingHorizontal: 158,
      flexDirection: "column",
    },

    // ── Header ───────────────────────────────────────────────────────────────
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logoBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    logoImage: { width: 42, height: 42, objectFit: "contain" },
    logoFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: G },
    orgBlock: { flexDirection: "column" },
    orgName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: G,
      letterSpacing: 0.7,
    },
    orgSubtitle: { fontSize: 7.5, color: GREY_MID, marginTop: 2 },
    accredBlock: { alignItems: "flex-end" },
    accredLabel: { fontSize: 7.5, color: GREY_MID, textAlign: "right" },
    accredStandard: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: G,
      textAlign: "right",
      marginTop: 2,
    },

    headerDivider: {
      height: 0.75,
      backgroundColor: G,
      opacity: 0.3,
      marginTop: 10,
    },

    // ── Body ─────────────────────────────────────────────────────────────────
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    certLabel: {
      fontSize: 8,
      color: GREY_FAINT,
      letterSpacing: 3.5,
      textTransform: "uppercase",
      marginBottom: 5,
    },
    certCode: {
      fontSize: 28,
      fontFamily: "Helvetica-Bold",
      color: G,
      marginBottom: 4,
    },
    certSchemeName: {
      fontSize: 10,
      color: BODY_TEXT,
      marginBottom: 16,
    },

    // Horizontal rule with centred dot
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      width: 360,
      marginBottom: 16,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: GREY_LINE },
    dividerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: G, marginHorizontal: 8 },

    awardedLabel: {
      fontSize: 7.5,
      color: GREY_FAINT,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    holderName: {
      fontSize: 22,
      fontFamily: "Helvetica-BoldOblique",
      color: DARK,
      marginBottom: 12,
    },
    achievementText: {
      fontSize: 8.5,
      color: BODY_TEXT,
      textAlign: "center",
      maxWidth: 400,
      lineHeight: 1.7,
      marginBottom: 12,
    },

    // Exam + org meta with vertical divider between them
    metaRow: { flexDirection: "row", alignItems: "center" },
    metaBlock: { alignItems: "center", paddingHorizontal: 16 },
    metaVertDivider: { width: 1, height: 24, backgroundColor: GREY_LINE },
    metaLabel: {
      fontSize: 7,
      color: GREY_FAINT,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 2,
    },
    metaValue: {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      textAlign: "center",
    },

    // ── Footer info row (DATE ISSUED | VALID UNTIL | STATUS | CERT NO) ───────
    footerInfoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      borderTopWidth: 0.75,
      borderTopColor: GREY_LINE,
      paddingTop: 10,
      marginTop: 12,
      marginBottom: 10,
    },
    footerInfoBlock: { alignItems: "center", flex: 1 },
    footerInfoLabel: {
      fontSize: 6.5,
      color: GREY_FAINT,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    footerInfoValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK },
    certNumberText: {
      fontSize: 7.5,
      fontFamily: "Helvetica-Oblique",
      color: GREY_MID,
      letterSpacing: 0.3,
    },

    // Status pill — green on pale green
    statusPill: {
      backgroundColor: G_PILL_BG,
      borderRadius: 10,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    statusPillText: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: G },

    // ── Signature + QR row ───────────────────────────────────────────────────
    sigFooterRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    sigsGroup: { flexDirection: "row", gap: 40 },
    signatureBlock: { alignItems: "center", minWidth: 110 },
    signatureImage: { width: 100, height: 34, objectFit: "contain" },
    signatureLine: { width: 110, height: 1, backgroundColor: GREY_LINE, marginTop: 4 },
    signerName: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: BODY_TEXT,
      marginTop: 3,
      textAlign: "center",
    },
    signerTitle: {
      fontSize: 7,
      color: GREY_FAINT,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      textAlign: "center",
      marginTop: 1,
    },

    qrBlock: { alignItems: "center" },
    qrImage: { width: 60, height: 60 },
    qrLabel: { fontSize: 6.5, color: GREY_FAINT, marginTop: 3, textAlign: "center" },

    // ── Status watermark — only on non-ACTIVE certificates ───────────────────
    watermark: {
      position: "absolute",
      top: "40%",
      left: "15%",
      fontSize: 72,
      opacity: 0.2,
      transform: "rotate(-35deg)",
      fontFamily: "Helvetica-Bold",
      letterSpacing: 8,
    },
  });

  const doc = (
    <Document
      title={`Certificate — ${cert.certificateNumber}`}
      author="Truemark Global Standards & Solutions Limited"
      subject={cert.scheme.name}
      keywords={`integrity:sha256:${integrityHash}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ── Corner decorations ───────────────────────────────────────── */}
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />

        {/* ── Double border ────────────────────────────────────────────── */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* ── Main content ─────────────────────────────────────────────── */}
        <View style={styles.contentWrap}>

          {/* Header: logo + org name | accreditation */}
          <View style={styles.headerRow}>
            <View style={styles.logoBlock}>
              {logoSrc ? (
                <Image src={logoSrc} style={styles.logoImage} />
              ) : (
                <View style={styles.logoFallback} />
              )}
              <View style={styles.orgBlock}>
                <Text style={styles.orgName}>TRUEMARK GLOBAL</Text>
                <Text style={styles.orgSubtitle}>Standards &amp; Solutions Limited</Text>
              </View>
            </View>
            <View style={styles.accredBlock}>
              <Text style={styles.accredLabel}>Personnel Certification Body</Text>
              <Text style={styles.accredStandard}>ISO/IEC 17024:2012 Accredited</Text>
            </View>
          </View>

          <View style={styles.headerDivider} />

          {/* Body — centred certification content */}
          <View style={styles.body}>
            <Text style={styles.certLabel}>Certificate of</Text>
            <Text style={styles.certCode}>{cert.schemeCodeSnapshot ?? cert.scheme.code}</Text>
            <Text style={styles.certSchemeName}>{cert.schemeNameSnapshot ?? cert.scheme.name}</Text>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerDot} />
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.awardedLabel}>Awarded to</Text>
            <Text style={styles.holderName}>{holderName}</Text>

            <Text style={styles.achievementText}>
              {`This certifies that the above-named individual has successfully fulfilled all requirements for ${cert.schemeNameSnapshot ?? cert.scheme.name} certification as set forth by Truemark Global Standards & Solutions Limited under the ISO/IEC 17024:2012 standard.`}
            </Text>

            {/* Exam paper / sponsoring org — with vertical divider between them */}
            {(cert.examPaperTitleSnapshot || cert.sponsoringOrgNameSnapshot) ? (
              <View style={styles.metaRow}>
                {cert.examPaperTitleSnapshot ? (
                  <View style={styles.metaBlock}>
                    <Text style={styles.metaLabel}>Examination</Text>
                    <Text style={styles.metaValue}>{cert.examPaperTitleSnapshot}</Text>
                  </View>
                ) : null}
                {cert.examPaperTitleSnapshot && cert.sponsoringOrgNameSnapshot ? (
                  <View style={styles.metaVertDivider} />
                ) : null}
                {cert.sponsoringOrgNameSnapshot ? (
                  <View style={styles.metaBlock}>
                    <Text style={styles.metaLabel}>Organisation</Text>
                    <Text style={styles.metaValue}>{cert.sponsoringOrgNameSnapshot}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Footer info row — 4 columns */}
          <View style={styles.footerInfoRow}>
            <View style={styles.footerInfoBlock}>
              <Text style={styles.footerInfoLabel}>Date Issued</Text>
              <Text style={styles.footerInfoValue}>{issuedDate}</Text>
            </View>
            <View style={styles.footerInfoBlock}>
              <Text style={styles.footerInfoLabel}>Valid Until</Text>
              <Text style={styles.footerInfoValue}>{expiresDate}</Text>
            </View>
            <View style={styles.footerInfoBlock}>
              <Text style={styles.footerInfoLabel}>Status</Text>
              {cert.status === "ACTIVE" ? (
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>ACTIVE</Text>
                </View>
              ) : (
                <Text style={styles.footerInfoValue}>{cert.status}</Text>
              )}
            </View>
            <View style={styles.footerInfoBlock}>
              <Text style={styles.footerInfoLabel}>Certificate No.</Text>
              <Text style={styles.certNumberText}>{cert.certificateNumber}</Text>
            </View>
          </View>

          {/* Signature blocks + QR */}
          <View style={styles.sigFooterRow}>
            <View style={styles.sigsGroup}>
              <View style={styles.signatureBlock}>
                {officerSigSrc ? (
                  <Image src={officerSigSrc} style={styles.signatureImage} />
                ) : null}
                <View style={styles.signatureLine} />
                <Text style={styles.signerName}>{officerName}</Text>
                <Text style={styles.signerTitle}>Certification Officer</Text>
              </View>
              <View style={styles.signatureBlock}>
                {directorSigSrc ? (
                  <Image src={directorSigSrc} style={styles.signatureImage} />
                ) : null}
                <View style={styles.signatureLine} />
                <Text style={styles.signerName}>{directorName}</Text>
                <Text style={styles.signerTitle}>Director of Certification</Text>
              </View>
            </View>

            {cert.qrCodeUrl ? (
              <View style={styles.qrBlock}>
                <Image src={cert.qrCodeUrl} style={styles.qrImage} />
                <Text style={styles.qrLabel}>Scan to verify</Text>
              </View>
            ) : null}
          </View>

        </View>

        {/* Status watermark — only on non-ACTIVE certificates */}
        {cert.status !== "ACTIVE" && (
          <Text style={[
            styles.watermark,
            { color: cert.status === "REVOKED" ? "#DC2626" : "#9CA3AF" },
          ]}>
            {cert.status}
          </Text>
        )}
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Certificate-${cert.certificateNumber}.pdf"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
