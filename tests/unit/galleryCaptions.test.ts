// Gallery photos carry a title and a line of text that guests see on hover.
import { cleanCaption, toGalleryPhoto, galleryTiles, GALLERY_TITLE_MAX, GALLERY_TEXT_MAX } from "@/lib/gallery";

describe("cleanCaption", () => {
  it("trims, collapses spaces and drops control characters", () => {
    expect(cleanCaption("  Deluxe \n\t Room\u0007 ", GALLERY_TITLE_MAX)).toBe("Deluxe Room");
  });

  it("cuts to the limit", () => {
    expect(cleanCaption("x".repeat(500), GALLERY_TEXT_MAX)).toHaveLength(GALLERY_TEXT_MAX);
  });

  it("turns anything that is not text into an empty caption", () => {
    expect(cleanCaption(undefined, 60)).toBe("");
    expect(cleanCaption(null, 60)).toBe("");
  });
});

describe("galleryTiles", () => {
  const photos = [
    toGalleryPhoto("https://example.com/hero.jpg"),
    { url: "https://example.com/room.jpg", title: "Deluxe Room", description: "Queen bed, own bathroom" },
    toGalleryPhoto("https://example.com/pool.jpg"),
  ];

  it("leaves the hero out and puts no time stamp on any tile", () => {
    const tiles = galleryTiles(photos, 4);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((t) => t.badge === undefined)).toBe(true);
  });

  it("carries the title and text, and uses them as the alt text", () => {
    const [room, pool] = galleryTiles(photos, 4);
    expect(room.title).toBe("Deluxe Room");
    expect(room.description).toBe("Queen bed, own bathroom");
    expect(room.alt).toBe("Deluxe Room. Queen bed, own bathroom");
    // No words: no caption at all, and a plain description for screen readers.
    expect(pool.title).toBeUndefined();
    expect(pool.description).toBeUndefined();
    expect(pool.alt).toBe("StoneWood Resort, photo 2 of 2");
  });
});
