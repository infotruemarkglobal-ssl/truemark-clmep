import { unstable_cache } from "next/cache";

export const CACHE_TAGS = {
  org: "org",
  user: "user",
  certificate: "certificate",
  exam: "exam",
  course: "course",
  payment: "payment",
  compliance: "compliance",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * Typed wrapper around Next.js unstable_cache.
 * @param fn     Async function to cache
 * @param keys   Stable key parts (e.g. userId, role) — must uniquely identify the result
 * @param tags   Cache tags for revalidation
 * @param ttl    Revalidation interval in seconds (default 60)
 */
export function cacheQuery<T>(
  fn: () => Promise<T>,
  keys: string[],
  tags: CacheTag[],
  ttl = 60,
): Promise<T> {
  return unstable_cache(fn, keys, { tags, revalidate: ttl })();
}
