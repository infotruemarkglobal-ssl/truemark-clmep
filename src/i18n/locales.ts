// Kept dependency-free (no next/headers, no db, no auth) so client
// components can import it directly without pulling server-only code
// (Prisma, node:net/tls via pg) into the browser bundle.
export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isSupportedLocale(value: string | undefined | null): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
