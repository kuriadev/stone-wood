// The stress probes (tests/stress): many people at once, every role on every
// route, junk input, floods. Kept out of `npm test` because they print
// reports rather than pass/fail; run with `npm run test:stress`.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS config, like jest.config.js
const base = require("./jest.config.js");
module.exports = { ...base, roots: ["<rootDir>/tests/stress"] };
