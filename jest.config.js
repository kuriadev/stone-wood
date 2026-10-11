/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/unit", "<rootDir>/tests/integration"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: false,
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2020",
          esModuleInterop: true,
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          isolatedModules: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/helpers/env.ts"],
};
