import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Load .env BEFORE any test file's module graph evaluates — several integration
  // tests read process.env.TEST_DATABASE_URL/DIRECT_URL/DATABASE_URL inside a
  // jest.mock() factory at db-client-construction time, which is too late for an
  // ad-hoc `require("dotenv").config()` inside the mock itself to reliably win the
  // race in every environment (CI included, where the real vars come from secrets
  // rather than a .env file — dotenv is a no-op there, which is fine).
  setupFiles: ["dotenv/config"],
  moduleNameMapper: {
    // Mirror the @/* alias in tsconfig.json
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        diagnostics: { ignoreCodes: ["TS151001"] },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  testTimeout: 60_000,
  // Run each test file sequentially so DB cleanup in afterAll doesn't race.
  maxWorkers: 1,
};

export default config;
