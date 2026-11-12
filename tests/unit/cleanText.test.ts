import { cleanText, cleanDeep, hasUnsafeText } from "@/lib/cleanText";

describe("cleanText", () => {
  it("removes emoji of every kind", () => {
    expect(cleanText("Juan 😀 Dela Cruz")).toBe("Juan  Dela Cruz");
    expect(cleanText("👨\u200D👩\u200D👧 family")).toBe(" family");
    expect(cleanText("👍🏽ok")).toBe("ok");
    expect(cleanText("🇵🇭 PH")).toBe(" PH");
    expect(cleanText("❤\uFE0F love ★ ✔")).toBe(" love  ");
    expect(cleanText("room 1\uFE0F\u20E3")).toBe("room 1");
  });

  it("removes control and invisible characters but keeps new lines", () => {
    expect(cleanText("a\u0000b\u0007c")).toBe("abc");
    expect(cleanText("zero\u200Bwidth\uFEFF")).toBe("zerowidth");
    expect(cleanText("file\u202Egnp.exe")).toBe("filegnp.exe");
    expect(cleanText("line one\nline two\tend")).toBe("line one\nline two\tend");
  });

  it("leaves ordinary text alone", () => {
    const s = "Peña, José \u2014 ₱1,500 #3 *note* (50%) @ 7:00 AM";
    expect(cleanText(s)).toBe(s);
    expect(hasUnsafeText(s)).toBe(false);
    expect(hasUnsafeText("hi 😀")).toBe(true);
  });

  it("cleans every string in a request body, except passwords", () => {
    const body = { name: "Ana 😀", list: ["ok", "🔥"], nested: { notes: "x\u200By" }, newPassword: "p😀ss", n: 3, ok: true };
    expect(cleanDeep(body)).toEqual({ name: "Ana ", list: ["ok", ""], nested: { notes: "xy" }, newPassword: "p😀ss", n: 3, ok: true });
  });
});
