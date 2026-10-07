/* Fail the build if a source file contains a control character.
 *
 * ── Why this exists ─────────────────────────────────────────────────
 * Source files get patched by scripts as well as by hand, and a patch script
 * written as a NON-raw Python string silently eats escapes:
 *
 *     "match(/\bSW-\d{4,}\b/)"   ->   'match(/\x08SW-\\d{4,}\x08/)'
 *
 * `\b` is a valid escape (backspace, 0x08) so it is swallowed; `\d` is not a
 * valid escape so it survives untouched. The result looks almost right — the
 * regex still reads `/...SW-\d{4,}.../` in most editors — but the word
 * boundaries are now invisible control characters and the pattern can never
 * match. It type-checks. It builds. It just silently does nothing.
 *
 * That happened three times in one session before anyone noticed, each time
 * caught only by piping a file through `cat -v`. This check turns a silent
 * wrong answer into a loud failure.
 *
 * The fix when it fires: rewrite the patch using a RAW string (r"..." in
 * Python) so backslashes survive, or write the file with an editor tool
 * instead of a shell heredoc.
 *
 * Tabs, newlines and carriage returns are legitimate and allowed.
 */
import fs from "fs";
import path from "path";

const ROOTS = ["app", "components", "lib", "contexts", "hooks", "types", "scripts"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|sql|md)$/;
const ALLOWED = new Set(["\t", "\n", "\r"]);

/** C0 controls and DEL, minus tab/newline/carriage return. */
const isBad = (ch) => {
  const c = ch.codePointAt(0);
  return (c < 0x20 || c === 0x7f) && !ALLOWED.has(ch);
};

const findings = [];

function scan(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      scan(p);
      continue;
    }
    if (!EXTENSIONS.test(e.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const ch of line) {
        if (!isBad(ch)) continue;
        findings.push({
          file: p.split(path.sep).join("/"),
          line: i + 1,
          code: "0x" + ch.codePointAt(0).toString(16).padStart(2, "0"),
          // Show the line with the offender made visible.
          preview: line.replace(/[\u0000-\u001f\u007f]/g, (m) => `\\x${m.codePointAt(0).toString(16).padStart(2, "0")}`).trim().slice(0, 110),
        });
        break; // one report per line is enough
      }
    });
  }
}

for (const r of ROOTS) scan(r);

if (findings.length === 0) {
  console.log(`✓ no control characters in ${ROOTS.join(", ")}`);
  process.exit(0);
}

console.error(`\n✗ ${findings.length} line(s) contain control characters.\n`);
console.error("  These are almost always a mangled escape: a patch written as a");
console.error("  non-raw Python string turns \\b into 0x08 while leaving \\d alone,");
console.error("  so a regex looks correct but can never match.\n");
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  (${f.code})`);
  console.error(`      ${f.preview}`);
}
console.error("\n  Fix: rewrite the patch with a RAW string (r\"...\"), or edit the file directly.\n");
process.exit(1);
