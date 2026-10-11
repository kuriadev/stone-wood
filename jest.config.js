/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
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
