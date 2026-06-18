// Next.js requires the middleware entry point to be at src/middleware.ts
// (for projects using the src/ directory layout) and to export a default
// function. The full middleware implementation lives in src/proxy.ts to keep
// it separately testable and avoid polluting the auto-resolved middleware path.
export { proxy as default, config } from "./proxy";
