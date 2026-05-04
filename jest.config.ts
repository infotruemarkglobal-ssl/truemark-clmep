import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
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
