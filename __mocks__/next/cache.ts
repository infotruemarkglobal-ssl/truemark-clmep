// Manual mock for next/cache, used automatically by Jest for every test file
// (Jest convention: a __mocks__/<module> directory adjacent to node_modules
// mocks that node module for all tests with no per-file jest.mock() needed).
//
// revalidateTag/revalidatePath depend on Next's request-scoped "static
// generation store" (AsyncLocalStorage), which only exists when a request
// actually passes through Next's own server runtime. Integration tests call
// route handler functions directly, bypassing that runtime entirely, so the
// real implementations throw "Invariant: static generation store missing"
// even though nothing is wrong — there's just no request context to revalidate
// against. These are the same no-op behavior a route would see if a build
// were misconfigured to skip caching entirely: harmless, no test relies on
// actual cache invalidation happening.
export function revalidateTag(_tag: string, _opts?: unknown): void {}
export function revalidatePath(_path: string, _type?: unknown): void {}

// unstable_cache: real implementation memoizes fn() behind Next's data cache.
// In tests we always want a fresh read, so just call straight through.
export function unstable_cache<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  _keyParts?: string[],
  _options?: unknown,
): (...args: Args) => Promise<T> {
  return (...args: Args) => fn(...args);
}
