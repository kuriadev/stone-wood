import {
  defaultFacilityPhoto, facilityPhotoKey, facilityIdFromKey, facilityPhotoUrl, parseImageDataUrl,
} from "@/lib/facilityPhotos";

describe("defaultFacilityPhoto", () => {
  it("picks a stock photo from the name", () => {
    expect(defaultFacilityPhoto("Swimming Pool")).toContain("1582268611958");
    expect(defaultFacilityPhoto("BBQ / Grilling Area")).toContain("1555939594");
    expect(defaultFacilityPhoto("Videoke")).toContain("1516280440614");
    expect(defaultFacilityPhoto("Parking Area")).toContain("1506521781263");
    expect(defaultFacilityPhoto("Events Venue")).toContain("1519167758481");
  });
  it("does not mistake a pool table for the swimming pool", () => {
    expect(defaultFacilityPhoto("Billiards")).toContain("1761591847985");
    expect(defaultFacilityPhoto("Pool Table")).toContain("1761591847985");
  });
  it("falls back to the resort for anything else", () => {
    expect(defaultFacilityPhoto("Cottage 3")).toContain("1540541338287");
    expect(defaultFacilityPhoto("")).toContain("1540541338287");
  });
});

describe("photo keys and urls", () => {
  it("round-trips a facility id through its row key", () => {
    expect(facilityIdFromKey(facilityPhotoKey(7))).toBe(7);
    expect(facilityIdFromKey("home_rate_cards")).toBeNull();
    expect(facilityIdFromKey("facility_photo:abc")).toBeNull();
    expect(facilityIdFromKey("facility_photo:0")).toBeNull();
  });
  it("versions the url by the save time", () => {
    const a = facilityPhotoUrl(3, "2026-11-01T00:00:00Z");
    const b = facilityPhotoUrl(3, "2026-11-02T00:00:00Z");
    expect(a).toMatch(/^\/api\/site-content\/facility-photo\?id=3&v=\d+$/);
    expect(a).not.toBe(b);
  });
});

describe("parseImageDataUrl", () => {
  it("reads a base64 image", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,QUJD")).toEqual({ type: "image/jpeg", base64: "QUJD" });
  });
  it("refuses anything that is not an image", () => {
    expect(parseImageDataUrl("data:text/html;base64,QUJD")).toBeNull();
    expect(parseImageDataUrl("data:image/svg+xml;base64,QUJD")).toBeNull();
    expect(parseImageDataUrl("https://example.com/a.jpg")).toBeNull();
  });
});
