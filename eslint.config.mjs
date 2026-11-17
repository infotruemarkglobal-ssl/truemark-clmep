import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next's core-web-vitals preset only pulls in a handful of
  // jsx-a11y rules (alt-text, aria-props, aria-proptypes, and similar static
  // checks) — it omits the ones that catch this codebase's actual gaps:
  // unlabelled form controls, keyboard-inaccessible click handlers, invalid
  // interactive roles. Layering the plugin's own "recommended" rules on top
  // turns those on for every file, so new violations get caught in CI going
  // forward rather than only during an occasional manual audit. Only `rules`
  // is spread (not the whole config) — Next's preset already registers the
  // "jsx-a11y" plugin object itself, and flat config errors if two config
  // entries both declare the same plugin name.
  { rules: jsxA11y.flatConfigs.recommended.rules },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Allow require() in test files — Jest mock factories must use require(),
  // not import, because they run in a different module context.
  {
    files: ["__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // This route renders a PDF server-side with @react-pdf/renderer, whose
  // <Image> is a PDF-drawing primitive (no `alt` concept) sharing a name
  // with the HTML element jsx-a11y/alt-text checks — not a real DOM node,
  // so the rule is a false positive here rather than a real gap.
  {
    // Glob-escaped: "[id]" would otherwise be parsed as a character class,
    // not the literal dynamic-route folder name.
    files: ["src/app/api/certificates/*/download/route.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
]);

export default eslintConfig;
