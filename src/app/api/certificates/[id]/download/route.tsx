import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { format } from "date-fns";
import { USER_ROLES } from "@/lib/constants";
import crypto from "crypto";

async function fetchToBase64(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;

  try {
    let url: string;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      url = src;
    } else {
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

// ── Brand colours ─────────────────────────────────────────────────────────────
const G          = "#0F6E56";   // primary green
const G_DARK     = "#085041";   // dark green (holder name)
const G_PILL_BG  = "#E1F5EE";   // status pill background
const G_MID      = "#1D9E75";   // lighter green for polygon fades
const GREY_MID   = "#5F5E5A";   // body text
const GREY_LABEL = "#888780";   // muted labels / divider lines
const GREY_LINE  = "#D3D1C7";   // thin dividers
const DARK       = "#2C2C2A";   // values

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!isAdmin && cert.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Certificate is not active (status: ${cert.status}). Download is unavailable.` },
      { status: 403 },
    );
  }

  const holderName = `${cert.user.firstName} ${cert.user.lastName}`;
  const issuedDate  = format(cert.issuedAt, "d MMMM yyyy");
  const expiresDate = cert.expiresAt ? format(cert.expiresAt, "d MMMM yyyy") : "No Expiry";

  const integrityPayload = `${cert.certificateNumber}|${cert.issuedAt.toISOString()}|${holderName}|${cert.scheme.code}`;
  const integrityHash = crypto.createHash("sha256").update(integrityPayload).digest("hex");

  const [logoSrc, officerSigSrc, directorSigSrc] = await Promise.all([
    fetchToBase64("/truemark-logo.png"),
    fetchToBase64(cert.decision.certificationOfficer.signatureUrl),
    fetchToBase64(directorSigSetting?.value ?? null),
  ]);
  const officerName  = `${cert.decision.certificationOfficer.firstName} ${cert.decision.certificationOfficer.lastName}`;
  const directorName = directorNameSetting?.value ?? "Director of Certification";

  const {
    renderToBuffer, Document, Page, View, Text, StyleSheet, Image,
    Svg, Polygon, Rect: SvgRect,
  } = await import("@react-pdf/renderer");

  // A4 landscape = 841 × 595 pts
  // Corner block proportional to SVG (140/800 × 841 ≈ 147, 140/580 × 595 ≈ 144)
  const CW = 147;  // corner block width
  const CH = 144;  // corner block height

  // Polygon fade points for top-left corner (scaled from SVG 800×580 → 841×595)
  // SVG poly1 TL: (140,0),(200,0),(0,200),(0,140) → scaled
  // SVG poly2 TL: (200,0),(240,0),(0,240),(0,200) → scaled
  const SX = 841 / 800;
  const SY = 595 / 580;
  const p = (x: number, y: number) => `${Math.round(x * SX)},${Math.round(y * SY)}`;

  const styles = StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      backgroundColor: "#ffffff",
      flexDirection: "column",
    },

    // ── Absolute corner blocks ────────────────────────────────────────────────
    cornerTL: { position: "absolute", top: 0, left: 0, width: CW, height: CH, backgroundColor: G },
    cornerTR: { position: "absolute", top: 0, right: 0, width: CW, height: CH, backgroundColor: G },
    cornerBL: { position: "absolute", bottom: 0, left: 0, width: CW, height: CH, backgroundColor: G },
    cornerBR: { position: "absolute", bottom: 0, right: 0, width: CW, height: CH, backgroundColor: G },

    // SVG overlay for polygon fades — full page size, pointer-events none
    svgOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

    // ── Double border ────────────────────────────────────────────────────────
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

    // ── Content (clear of corner blocks) ─────────────────────────────────────
    contentWrap: {
      flex: 1,
      paddingTop: 22,
      paddingBottom: 20,
      paddingHorizontal: 160,
      flexDirection: "column",
    },

    // ── Header ───────────────────────────────────────────────────────────────
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logoImage: { width: 200, height: 200, objectFit: "contain" },
    logoFallback: { width: 200, height: 200, borderRadius: 100, backgroundColor: G },
    accredBlock: { alignItems: "flex-end" },
    accredLabel: { fontSize: 8, color: GREY_MID, textAlign: "right", letterSpacing: 0.5 },
    accredStandard: { fontSize: 9, fontFamily: "Helvetica-Bold", color: G_DARK, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },

    headerDivider: { height: 0.8, backgroundColor: G, opacity: 0.5, marginTop: 8, marginBottom: 6 },

    // ── Body (compact, not stretched) ─────────────────────────────────────────
    body: { alignItems: "center", paddingTop: 14, paddingBottom: 0 },
    certOfLabel: { fontSize: 11, color: GREY_LABEL, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 },
    certCode: { fontSize: 46, fontFamily: "Helvetica-Bold", color: G, letterSpacing: 2, marginBottom: 4 },
    certSchemeName: { fontSize: 13, color: GREY_MID, letterSpacing: 1, marginBottom: 12 },

    dividerRow: { flexDirection: "row", alignItems: "center", width: 240, marginBottom: 10 },
    dividerLine: { flex: 1, height: 1.5, backgroundColor: G },
    dividerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: G, marginHorizontal: 8 },

    awardedLabel: { fontSize: 9.5, color: GREY_LABEL, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 },
    holderName: { fontSize: 38, fontFamily: "Helvetica-BoldOblique", color: G_DARK, marginBottom: 6 },
    holderUnderline: { width: 280, height: 0.5, backgroundColor: G, opacity: 0.4, marginBottom: 12 },

    achievementText: { fontSize: 10.5, color: GREY_MID, textAlign: "center", maxWidth: 440, lineHeight: 1.7, marginBottom: 10 },

    metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
    metaBlock: { alignItems: "center", paddingHorizontal: 20 },
    metaVertDivider: { width: 0.8, height: 24, backgroundColor: GREY_LINE },
    metaLabel: { fontSize: 8, color: GREY_LABEL, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
    metaValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: DARK, textAlign: "center" },

    // ── Footer info row ───────────────────────────────────────────────────────
    footerInfoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      borderTopWidth: 0.7,
      borderTopColor: GREY_LINE,
      paddingTop: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    footerInfoBlock: { alignItems: "center", flex: 1 },
    footerInfoLabel: { fontSize: 8, color: GREY_LABEL, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    footerInfoValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DARK },
    certNumberText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DARK },

    statusPill: { backgroundColor: G_PILL_BG, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
    statusPillText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: G, letterSpacing: 1 },

    // ── Signature row — both centered on page ────────────────────────────────
    sigFooterRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
    },
    signatureBlock: { alignItems: "center", width: 140 },
    signatureImage: { width: 110, height: 36, objectFit: "contain", marginBottom: 2 },
    signatureLine: { width: 140, height: 0.8, backgroundColor: G },
    signerName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK, marginTop: 4, textAlign: "center" },
    signerTitle: { fontSize: 8, color: GREY_LABEL, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center", marginTop: 1 },

    // QR centred within the bottom-right corner block (147 × 144 pt)
    qrAbsolute: { position: "absolute", bottom: 34, right: 42, alignItems: "center" },
    qrImage: { width: 64, height: 64 },
    qrLabel: { fontSize: 7, color: GREY_LABEL, marginTop: 3, textAlign: "center" },

    // Watermark
    watermark: {
      position: "absolute",
      top: "40%",
      left: "15%",
      fontSize: 72,
      opacity: 0.18,
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

        {/* ── Corner solid blocks ─────────────────────────────────────────── */}
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />

        {/* ── Fix #1: SVG polygon fades on each corner ────────────────────── */}
        <Svg width={841} height={595} style={styles.svgOverlay}>
          {/* Top-left fades */}
          <Polygon
            points={`${p(140,0)} ${p(200,0)} ${p(0,200)} ${p(0,140)}`}
            fill={G_MID}
            opacity={0.5}
          />
          <Polygon
            points={`${p(200,0)} ${p(240,0)} ${p(0,240)} ${p(0,200)}`}
            fill={G}
            opacity={0.25}
          />
          {/* Top-right fades */}
          <Polygon
            points={`${p(660,0)} ${p(600,0)} ${p(800,200)} ${p(800,140)}`}
            fill={G_MID}
            opacity={0.5}
          />
          <Polygon
            points={`${p(600,0)} ${p(560,0)} ${p(800,240)} ${p(800,200)}`}
            fill={G}
            opacity={0.25}
          />
          {/* Bottom-left fades */}
          <Polygon
            points={`${p(0,440)} ${p(0,380)} ${p(200,580)} ${p(140,580)}`}
            fill={G_MID}
            opacity={0.5}
          />
          <Polygon
            points={`${p(0,380)} ${p(0,340)} ${p(240,580)} ${p(200,580)}`}
            fill={G}
            opacity={0.25}
          />
          {/* Bottom-right fades */}
          <Polygon
            points={`${p(800,440)} ${p(800,380)} ${p(600,580)} ${p(660,580)}`}
            fill={G_MID}
            opacity={0.5}
          />
          <Polygon
            points={`${p(800,380)} ${p(800,340)} ${p(560,580)} ${p(600,580)}`}
            fill={G}
            opacity={0.25}
          />
        </Svg>

        {/* ── Double border ────────────────────────────────────────────────── */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <View style={styles.contentWrap}>

          {/* Header — Fix #2: logo alone (larger), no org text */}
          <View style={styles.headerRow}>
            {logoSrc ? (
              <Image src={logoSrc} style={styles.logoImage} />
            ) : (
              <View style={styles.logoFallback} />
            )}
            <View style={styles.accredBlock}>
              <Text style={styles.accredLabel}>Personnel Certification Body</Text>
              <Text style={styles.accredStandard}>ISO/IEC 17024:2012 Accredited</Text>
            </View>
          </View>

          <View style={styles.headerDivider} />

          {/* Body */}
          <View style={styles.body}>
            <Text style={styles.certOfLabel}>Certificate of</Text>
            <Text style={styles.certCode}>{cert.schemeCodeSnapshot ?? cert.scheme.code}</Text>
            <Text style={styles.certSchemeName}>{cert.schemeNameSnapshot ?? cert.scheme.name}</Text>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerDot} />
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.awardedLabel}>Awarded to</Text>
            <Text style={styles.holderName}>{holderName}</Text>
            <View style={styles.holderUnderline} />

            <Text style={styles.achievementText}>
              {`This certifies that the above-named individual has successfully fulfilled all requirements for ${cert.schemeNameSnapshot ?? cert.scheme.name} certification as set forth by Truemark Global Standards & Solutions Limited under the ISO/IEC 17024:2012 standard.`}
            </Text>

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

          {/* Footer info row */}
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

          {/* Flex spacer — pushes signatures to bottom of contentWrap */}
          <View style={{ flex: 1 }} />

          {/* Signatures — centred */}
          <View style={styles.sigFooterRow}>
            {/* Signature 1 — Certification Officer (left) */}
            <View style={styles.signatureBlock}>
              {officerSigSrc ? (
                <Image src={officerSigSrc} style={styles.signatureImage} />
              ) : null}
              <View style={styles.signatureLine} />
              <Text style={styles.signerName}>{officerName}</Text>
              <Text style={styles.signerTitle}>Certification Officer</Text>
            </View>

            {/* Gap between sig 1 and sig 2 */}
            <View style={{ width: 20 }} />

            {/* Signature 2 — Director of Certification (center) */}
            <View style={styles.signatureBlock}>
              {directorSigSrc ? (
                <Image src={directorSigSrc} style={styles.signatureImage} />
              ) : null}
              <View style={styles.signatureLine} />
              <Text style={styles.signerName}>{directorName}</Text>
              <Text style={styles.signerTitle}>Director of Certification</Text>
            </View>
          </View>
        </View>

        {/* Fix #4: QR absolutely positioned flush against right corner block */}
        {cert.qrCodeUrl ? (
          <View style={styles.qrAbsolute}>
            <Image src={cert.qrCodeUrl} style={styles.qrImage} />
            <Text style={styles.qrLabel}>Scan to verify</Text>
          </View>
        ) : null}

        {/* Status watermark — non-ACTIVE only */}
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
