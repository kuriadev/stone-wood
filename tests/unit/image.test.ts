/* Photos must survive being saved.
 *
 * The QA audit (W-1) reproduced this: /api/rooms cut `img` to 2000
 * characters, so every uploaded room photo was stored as a corrupt fragment
 * behind a 200 OK. These tests pin the rule that replaced it — validate and
 * refuse, never shorten (lib/image.ts).
 */

import { cleanImageRef, cleanImageList, MAX_IMAGE_CHARS } from "@/lib/image";

/** A data URL the size of a real photo. 2000 characters is ~1.4 KB. */
const photoOf = (kb: number) => `data:image/jpeg;base64,${"A".repeat(Math.ceil((kb * 1024 * 4) / 3))}`;

describe("cleanImageRef", () => {
  it("keeps a 50 KB photo byte for byte", () => {
    const photo = photoOf(50);
    const r = cleanImageRef(photo, "room photo");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(photo);
    // The regression itself: it used to come back exactly 2000 long.
    expect(r.value.length).toBe(photo.length);
    expect(r.value.length).toBeGreaterThan(2000);
  });

  it("refuses an oversized photo instead of truncating it", () => {
    const r = cleanImageRef(`data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS + 10)}`, "room photo");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/too large/i);
  });

  it("passes an ordinary link through", () => {
    expect(cleanImageRef("https://images.unsplash.com/photo-1?q=80&w=2400"))
      .toEqual({ ok: true, value: "https://images.unsplash.com/photo-1?q=80&w=2400" });
  });

  it("treats blank as 'no photo'", () => {
    expect(cleanImageRef("")).toEqual({ ok: true, value: "" });
    expect(cleanImageRef(undefined)).toEqual({ ok: true, value: "" });
  });

  it.each([
    ["png", "data:image/png;base64,iVBORw0KGgo="],
    ["jpeg", "data:image/jpeg;base64,/9j/4AAQ"],
    ["webp", "data:image/webp;base64,UklGRg=="],
    ["gif", "data:image/gif;base64,R0lGODlh"],
    ["avif", "data:image/avif;base64,AAAAIGZ0"],
  ])("accepts %s", (_name, value) => {
    expect(cleanImageRef(value).ok).toBe(true);
  });

  it.each([
    ["an HTML document", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    // SVG is a document, not a bitmap. A room photo has no reason to be one.
    ["an SVG", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["a bare data URI", "data:;base64,AAAA"],
  ])("refuses %s", (_name, value) => {
    expect(cleanImageRef(value).ok).toBe(false);
  });

  it("refuses an absurdly long link", () => {
    expect(cleanImageRef(`https://example.com/${"x".repeat(3000)}`).ok).toBe(false);
  });
});

describe("cleanImageList", () => {
  it("keeps every photo in a gallery intact and drops the blanks", () => {
    const photo = photoOf(40);
    const r = cleanImageList([photo, "https://example.com/a.jpg", ""], "room photo");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(2);
    expect(r.value[0]).toBe(photo);
  });

  it("refuses the whole gallery when one photo is bad", () => {
    const r = cleanImageList([photoOf(40), `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS + 10)}`]);

    expect(r.ok).toBe(false);
  });
});
