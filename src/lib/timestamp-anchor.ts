import crypto from "crypto";
import {
  createTimestampRequestFromHash,
  sendTimestampRequest,
  parseTimestampResponse,
  KNOWN_TSA_URLS,
} from "pdf-rfc3161";

// External notarisation of the audit-log hash chain (ISO 27001 A.8.15) via a
// real RFC 3161 Time-Stamp Authority — a free, publicly-operated service run
// by a real Certificate Authority, no account or API key needed. Chosen over
// OpenTimestamps/Bitcoin-anchoring after checking the `opentimestamps` npm
// package directly: last published January 2021, and installing it pulls in
// 11 vulnerabilities (2 critical) via long-deprecated `request`/`request-
// promise` dependencies — not something to add to a production app. RFC 3161
// timestamps are also synchronously verifiable (seconds, not the hours an
// on-chain Bitcoin confirmation takes), and are the mechanism ISO/SOC
// auditors already recognise, unlike a blockchain anchor.
const TSA_URL = KNOWN_TSA_URLS.DIGICERT;

export type TimestampAttestation = {
  tsaUrl: string;
  // The full raw RFC 3161 TimeStampResp bytes (status + token), stored
  // as-is so re-verification can call parseTimestampResponse directly on
  // exactly what the TSA sent — no re-encoding of our own.
  responseBytes: Buffer;
  genTime: Date;
  serialNumber: string;
};

/**
 * Requests a real RFC 3161 timestamp token for `digestHex` (a hex-encoded
 * SHA-256 hash) from a live public TSA. Verifies the response is bound to
 * the exact hash and nonce we sent (RFC 3161 §2.4.2 replay defence) before
 * returning — a mismatch here means the TSA's response cannot be trusted
 * for this digest and is treated as a failure, not silently accepted.
 */
export async function requestTimestampAttestation(digestHex: string): Promise<TimestampAttestation> {
  const hash = Buffer.from(digestHex, "hex");
  const { request, nonce } = createTimestampRequestFromHash(hash, "SHA-256", { requestCertificate: true });

  const responseBytes = await sendTimestampRequest(request, { url: TSA_URL, timeout: 15_000, retry: 2 });
  const parsed = parseTimestampResponse(responseBytes);

  if (parsed.status !== 0 && parsed.status !== 1) {
    throw new Error(`TSA ${TSA_URL} refused the timestamp request (status ${parsed.status})`);
  }
  if (!parsed.token || !parsed.info) {
    throw new Error("TSA response was granted but carried no usable timestamp token");
  }
  if (parsed.info.messageDigest !== digestHex) {
    throw new Error("TSA response digest does not match the requested hash — refusing to trust it");
  }
  if (!parsed.info.nonce || !Buffer.from(parsed.info.nonce).equals(Buffer.from(nonce))) {
    throw new Error("TSA response nonce does not match the request — possible replay, refusing to trust it");
  }

  return {
    tsaUrl: TSA_URL,
    responseBytes: Buffer.from(responseBytes),
    genTime: parsed.info.genTime,
    serialNumber: parsed.info.serialNumber,
  };
}

/**
 * Re-derives the digest a stored timestamp response attests to, independent
 * of anything this app claims about it — re-parses the raw response bytes
 * fresh via the same library function used to request it. Used by the
 * anchor-verification flow to confirm a stored AuditAnchor's response still
 * genuinely attests to the expected digest.
 */
export function extractAttestedDigest(responseBase64: string): { messageDigest: string; genTime: Date; hashAlgorithm: string } {
  const responseBytes = new Uint8Array(Buffer.from(responseBase64, "base64"));
  const parsed = parseTimestampResponse(responseBytes);
  if (!parsed.info) throw new Error("Could not extract timestamp info from stored response");
  return { messageDigest: parsed.info.messageDigest, genTime: parsed.info.genTime, hashAlgorithm: parsed.info.hashAlgorithm };
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
