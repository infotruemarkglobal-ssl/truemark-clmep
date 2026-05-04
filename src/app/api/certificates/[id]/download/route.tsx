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

const G = "#065f46";       // brand green
const G_LIGHT = "#a7f3d0"; // light green accent
const GREY_MID = "#6b7280";
const GREY_LINE = "#d1d5db";
const GREY_FAINT = "#9ca3af";
const DARK = "#1f2937";
const BODY_TEXT = "#4b5563";

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

  const styles = StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      backgroundColor: "#ffffff",
      padding: 44,
      flexDirection: "column",
    },
    outerBorder: {
      position: "absolute",
      top: 12,
      left: 12,
      right: 12,
      bottom: 12,
      borderWidth: 3,
      borderColor: G,
      borderStyle: "solid",
    },
    innerBorder: {
      position: "absolute",
      top: 17,
      left: 17,
      right: 17,
      bottom: 17,
      borderWidth: 1,
      borderColor: G_LIGHT,
      borderStyle: "solid",
    },

    // ── Header ──────────────────────────────────────────────────────────
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logoBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    logoImage: {
      width: 58,
      height: 58,
    },
    logoFallback: {
      width: 58,
      height: 58,
      backgroundColor: G_LIGHT,
      borderRadius: 4,
    },
    orgNameBlock: {
      justifyContent: "center",
    },
    orgPrimary: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: G,
      letterSpacing: 0.8,
    },
    accredBadge: {
      alignItems: "flex-end",
    },
    accredText: {
      fontSize: 8,
      color: GREY_MID,
      textAlign: "right",
    },
    accredStandard: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: G,
      textAlign: "right",
      marginTop: 2,
    },
    headerDivider: {
      height: 1,
      backgroundColor: G_LIGHT,
      marginTop: 10,
      marginBottom: 0,
    },

    // ── Body ─────────────────────────────────────────────────────────────
    body: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    certLabel: {
      fontSize: 9,
      color: GREY_MID,
      letterSpacing: 3,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    certCode: {
      fontSize: 26,
      fontFamily: "Helvetica-Bold",
      color: G,
      marginBottom: 3,
    },
    certSchemeName: {
      fontSize: 11,
      color: "#374151",
      marginBottom: 18,
    },
    divider: {
      width: 60,
      height: 2,
      backgroundColor: G,
      marginBottom: 18,
    },
    awardedLabel: {
      fontSize: 8,
      color: GREY_FAINT,
      letterSpacing: 2,
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
      fontSize: 9,
      color: BODY_TEXT,
      textAlign: "center",
      maxWidth: 420,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 4,
    },
    metaLabel: {
      fontSize: 7,
      color: GREY_FAINT,
      textTransform: "uppercase",
      letterSpacing: 1,
      width: 76,
      textAlign: "right",
      marginRight: 8,
      paddingTop: 1,
    },
    metaValue: {
      fontSize: 9,
      color: DARK,
      fontFamily: "Helvetica-Bold",
    },

    // ── Details bar ──────────────────────────────────────────────────────
    detailsDivider: {
      height: 1,
      backgroundColor: GREY_LINE,
      width: 420,
      marginTop: 14,
      marginBottom: 10,
    },
    detailsRow: {
      flexDirection: "row",
      gap: 32,
    },
    detailBlock: {
      alignItems: "center",
    },
    detailLabel: {
      fontSize: 7,
      color: GREY_FAINT,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    detailValue: {
      fontSize: 9,
      color: DARK,
      fontFamily: "Helvetica-Bold",
    },
    certNumberText: {
      fontSize: 8,
      color: GREY_FAINT,
      fontFamily: "Helvetica-Oblique",
      letterSpacing: 0.5,
    },

    // ── Footer ───────────────────────────────────────────────────────────
    footerDivider: {
      height: 1,
      backgroundColor: G_LIGHT,
      marginTop: 14,
      marginBottom: 12,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    sigsGroup: {
      flexDirection: "row",
      gap: 48,
    },
    signatureBlock: {
      alignItems: "center",
      minWidth: 120,
    },
    signatureImage: {
      width: 110,
      height: 38,
      objectFit: "contain",
    },
    signatureLine: {
      width: 120,
      height: 1,
      backgroundColor: GREY_LINE,
      marginTop: 4,
    },
    signerName: {
      fontSize: 8,
      color: "#374151",
      fontFamily: "Helvetica-Bold",
      marginTop: 4,
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
    qrBlock: {
      alignItems: "center",
    },
    qrImage: {
      width: 58,
      height: 58,
    },
    qrLabel: {
      fontSize: 7,
      color: GREY_FAINT,
      marginTop: 3,
      textAlign: "center",
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
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* ── Header: logo + org name + accreditation ─────────────── */}
        <View style={styles.headerRow}>
          <View style={styles.logoBlock}>
            {logoSrc ? (
              <Image src={logoSrc} style={styles.logoImage} />
            ) : (
              <View style={styles.logoFallback} />
            )}
            <View style={styles.orgNameBlock}>
              <Text style={styles.orgPrimary}>TRUEMARK GLOBAL STANDARDS &amp; SOLUTIONS LIMITED</Text>
            </View>
          </View>
          <View style={styles.accredBadge}>
            <Text style={styles.accredText}>Personnel Certification Body</Text>
            <Text style={styles.accredStandard}>ISO/IEC 17024:2012 Accredited</Text>
          </View>
        </View>

        <View style={styles.headerDivider} />

        {/* ── Body: certification details ───────────────────────────── */}
        <View style={styles.body}>
          <Text style={styles.certLabel}>Certificate of</Text>
          <Text style={styles.certCode}>{cert.scheme.code}</Text>
          <Text style={styles.certSchemeName}>{cert.scheme.name}</Text>

          <View style={styles.divider} />

          <Text style={styles.awardedLabel}>Awarded to</Text>
          <Text style={styles.holderName}>{holderName}</Text>

          <Text style={styles.achievementText}>
            {`This certifies that the above-named individual has successfully fulfilled all requirements for ${cert.scheme.name} certification as set forth by Truemark Global Standards & Solutions Limited under the ISO/IEC 17024:2012 standard.`}
          </Text>

          {cert.examPaperTitleSnapshot ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Examination</Text>
              <Text style={styles.metaValue}>{cert.examPaperTitleSnapshot}</Text>
            </View>
          ) : null}
          {cert.candidateEmployerSnapshot ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Employer</Text>
              <Text style={styles.metaValue}>{cert.candidateEmployerSnapshot}</Text>
            </View>
          ) : null}
          {cert.sponsoringOrgNameSnapshot ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Organisation</Text>
              <Text style={styles.metaValue}>{cert.sponsoringOrgNameSnapshot}</Text>
            </View>
          ) : null}

          <View style={styles.detailsDivider} />

          <View style={styles.detailsRow}>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Date Issued</Text>
              <Text style={styles.detailValue}>{issuedDate}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Valid Until</Text>
              <Text style={styles.detailValue}>{expiresDate}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{cert.status}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Certificate No.</Text>
              <Text style={styles.certNumberText}>{cert.certificateNumber}</Text>
            </View>
          </View>
        </View>

        {/* ── Footer: signatures + QR ───────────────────────────────── */}
        <View style={styles.footerDivider} />
        <View style={styles.footerRow}>
          <View style={styles.sigsGroup}>
            {/* Certification Officer */}
            <View style={styles.signatureBlock}>
              {officerSigSrc ? (
                <Image src={officerSigSrc} style={styles.signatureImage} />
              ) : null}
              <View style={styles.signatureLine} />
              <Text style={styles.signerName}>{officerName}</Text>
              <Text style={styles.signerTitle}>Certification Officer</Text>
            </View>

            {/* Director of Certification */}
            <View style={styles.signatureBlock}>
              {directorSigSrc ? (
                <Image src={directorSigSrc} style={styles.signatureImage} />
              ) : null}
              <View style={styles.signatureLine} />
              <Text style={styles.signerName}>{directorName}</Text>
              <Text style={styles.signerTitle}>Director of Certification</Text>
            </View>
          </View>

          {/* QR Code */}
          {cert.qrCodeUrl ? (
            <View style={styles.qrBlock}>
              <Image src={cert.qrCodeUrl} style={styles.qrImage} />
              <Text style={styles.qrLabel}>Scan to verify authenticity</Text>
            </View>
          ) : null}
        </View>
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
