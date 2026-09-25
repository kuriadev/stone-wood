/**
 * The one configured dayjs instance.
 *
 * Every date helper imports from here rather than from "dayjs" directly, so
 * the plugins are guaranteed to be registered. `customParseFormat` is the
 * important one: without it `dayjs("2026-02-31")` is lenient and rolls over
 * to 2 March, which is exactly the bug the old hand-rolled parser existed to
 * guard against. With it, `dayjs(s, "YYYY-MM-DD", true)` rejects impossible
 * dates outright.
 *
 * Everything here works in LOCAL time on purpose. The resort is in Manila
 * (UTC+8) and a booking date is a wall-clock day, not an instant — parsing or
 * formatting through UTC lands on the previous day for half of every day,
 * which this codebase has been bitten by before.
 */
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

/** The wire format for every date the app stores or puts in a URL. */
export const DATE_FMT = "YYYY-MM-DD";

// Exported by NAME, deliberately. `export default dayjs` re-exports a CJS
// default through ESM, and what a consumer receives then depends on the
// bundler's interop: imported that way it resolved to an object rather than
// a callable here. A named export is unambiguous everywhere.
export { dayjs };
