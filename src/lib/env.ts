/**
 * Environment variable validation.
 * Throws at startup in production if any required variable is missing.
 * Import this in src/lib/db.ts so it runs on first DB connection.
 */

const REQUIRED_IN_PRODUCTION: Array<{ key: string; hint: string }> = [
  { key: "DATABASE_URL",              hint: "Neon PostgreSQL pooled connection string" },
  { key: "AUTH_SECRET",               hint: "Run: openssl rand -base64 32" },
  { key: "NEXTAUTH_URL",              hint: "e.g. https://clmep.truemarkglobal.com" },
  { key: "NEXT_PUBLIC_APP_URL",       hint: "Same as NEXTAUTH_URL" },
  { key: "EMAIL_FROM",                hint: "e.g. noreply@truemarkglobal.com" },
  { key: "EMAIL_SERVER_HOST",         hint: "SMTP host, e.g. smtp.resend.com" },
  { key: "PAYSTACK_SECRET_KEY",       hint: "From Paystack dashboard — use sk_live_* for production" },
  { key: "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", hint: "From Paystack dashboard — use pk_live_* for production" },
  { key: "INNGEST_SIGNING_KEY",       hint: "From Inngest dashboard" },
  { key: "INNGEST_EVENT_KEY",         hint: "From Inngest dashboard" },
];

const WARN_IN_PRODUCTION: Array<{ key: string; hint: string }> = [
  { key: "ANTHROPIC_API_KEY",         hint: "Required for AI exam question generation" },
  { key: "NEXT_PUBLIC_SENTRY_DSN",    hint: "Required for error tracking — create project at sentry.io" },
  { key: "STORAGE_PROVIDER",          hint: "Set to 's3' and configure AWS_* vars for cloud file storage" },
];

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_IN_PRODUCTION.filter(
    ({ key }) => !process.env[key] || process.env[key] === ""
  );

  if (missing.length > 0) {
    const lines = missing.map(({ key, hint }) => `  - ${key}: ${hint}`).join("\n");
    throw new Error(
      `[env] Missing required environment variables in production:\n${lines}\n\nSet these in your deployment environment and restart.`
    );
  }

  // Warn but don't throw for optional-but-recommended vars
  for (const { key, hint } of WARN_IN_PRODUCTION) {
    if (!process.env[key] || process.env[key] === "") {
      console.warn(`[env] WARNING: ${key} is not set — ${hint}`);
    }
  }

  // Verify S3/R2 credentials are all present when STORAGE_PROVIDER=s3.
  // Missing any one of these silently breaks all file uploads and downloads.
  if ((process.env.STORAGE_PROVIDER ?? "local") === "s3") {
    const S3_REQUIRED = ["AWS_S3_ENDPOINT", "AWS_S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] as const;
    const missingS3 = S3_REQUIRED.filter((k) => !process.env[k] || process.env[k] === "");
    if (missingS3.length > 0) {
      console.error(
        `[env] STORAGE_PROVIDER=s3 but the following variables are missing: ${missingS3.join(", ")}. ` +
        "File uploads and downloads will fail until these are set."
      );
    }
  }

  // SECURITY: uploads are unscanned without a scanner — hard block kicks in
  // for S3 uploads, but this warning fires at startup so ops see it before the
  // first upload arrives.
  // Scanner priority: CLAMAV_HOST (self-hosted) → VIRUSTOTAL_API_KEY (cloud) → hard block.
  if (
    (process.env.STORAGE_PROVIDER ?? "local") !== "local" &&
    !process.env.CLAMAV_HOST &&
    !process.env.VIRUSTOTAL_API_KEY
  ) {
    console.error(
      "SECURITY WARNING: File uploads are not being scanned for malware. " +
      "Set VIRUSTOTAL_API_KEY (cloud, recommended for Vercel) or CLAMAV_HOST (self-hosted) " +
      "before accepting uploads. Without a scanner, all uploads are hard-blocked."
    );
  }

  // Warn if still on test Paystack keys
  if (process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) {
    console.warn("[env] WARNING: PAYSTACK_SECRET_KEY is a test key — switch to live keys before accepting real payments");
  }

  // ASVS 6.4.1 — AUTH_SECRET must be ≥ 32 bytes (256 bits) and not the dev placeholder.
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.includes("dev-secret")) {
    throw new Error("[env] AUTH_SECRET is the development placeholder. Generate one: openssl rand -base64 32");
  }
  // base64-encoded 32 bytes → 44 chars; hex 32 bytes → 64 chars. Enforce ≥ 32 raw chars.
  if (secret.length < 32) {
    throw new Error(`[env] AUTH_SECRET is too short (${secret.length} chars). Minimum 32 characters required. Generate one: openssl rand -base64 32`);
  }
}
