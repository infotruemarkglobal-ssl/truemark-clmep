import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import signpdf from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";

// Embeds a real PKCS#7/CMS digital signature in a certificate PDF, using a
// self-signed X.509 certificate (see .env.example — CERT_PDF_SIGNING_P12).
// This proves the PDF's bytes haven't changed since Truemark signed it,
// verifiable with any PDF signature tool (`pdfsig`, Adobe Reader's own
// integrity check, etc.) — but because the certificate is self-signed rather
// than CA-issued, viewers will show "signature valid, identity not verified"
// rather than a trusted green checkmark. That's a real, honest limitation:
// a CA-trusted signature needs a certificate this environment has no path to
// obtain (Adobe AATL membership or a paid document-signing certificate).
//
// If CERT_PDF_SIGNING_P12 isn't set, returns the PDF unsigned — same
// graceful-fallback pattern as generateOpenBadgeJwt's HS256 fallback.
export async function signCertificatePdf(pdfBuffer: Buffer): Promise<Buffer> {
  const p12Base64 = process.env.CERT_PDF_SIGNING_P12;
  if (!p12Base64) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: "Certificate issued by Truemark Global",
    contactInfo: "certificates@truemarkglobal.com",
    name: "Truemark Global",
    location: "Nigeria",
  });
  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save());

  const p12Buffer = Buffer.from(p12Base64, "base64");
  const signer = new P12Signer(p12Buffer, {
    passphrase: process.env.CERT_PDF_SIGNING_P12_PASSPHRASE ?? "",
  });

  return signpdf.sign(pdfWithPlaceholder, signer);
}
