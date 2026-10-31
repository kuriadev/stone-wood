/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // 15s, not Jest's 5s. A few tests build real files (the import .xlsx) and
  // ts-jest type-checks each one first; with a build or lint running beside
  // the suite, one now and then ran out the clock and failed on an
  // otherwise green run. A genuine failure still fails.
  testTimeout: 15_000,
  roots: ["<rootDir>/tests/unit", "<rootDir>/tests/integration"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: {
    "^.+\.tsx?$": [
      "ts-jest",
      {
        // Type-check the tests. Off, a test could assert against a
        // function signature that no longer exists and still pass.
        diagnostics: true,
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2020",
          esModuleInterop: true,
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          // MUST stay false for ts-jest: it reads this and, when true,
          // drops to transpile-only — which silently disables `diagnostics`
          // above. The app's own tsconfig.json sets it true (Next needs
          // that); this overrides it for the test run only.
          isolatedModules: false,
          resolveJsonModule: true,
        },
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/helpers/env.ts"],
};
