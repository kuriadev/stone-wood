import { validateHeroMedia, heroUploadProblem, heroUploadPath } from "@/lib/heroMedia";

describe("hero media", () => {
  it("takes a photo or a video at an https link", () => {
    expect(validateHeroMedia({ kind: "video", src: "https://x.supabase.co/storage/v1/object/public/site-media/hero/a.mp4" }).ok).toBe(true);
    expect(validateHeroMedia({ kind: "image", src: "https://example.com/a.png" }).ok).toBe(true);
  });
  it("refuses anything else", () => {
    expect(validateHeroMedia({ kind: "gif", src: "https://a/b" }).ok).toBe(false);
    expect(validateHeroMedia({ kind: "image", src: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateHeroMedia({ kind: "image", src: "http://plain.example/a.png" }).ok).toBe(false);
    expect(validateHeroMedia(null).ok).toBe(false);
  });
  it("checks the file type and size before uploading", () => {
    expect(heroUploadProblem("video", "video/mp4", 20 * 1024 * 1024)).toBeNull();
    expect(heroUploadProblem("video", "video/mp4", 60 * 1024 * 1024)).toMatch(/too large/);
    expect(heroUploadProblem("video", "video/quicktime", 1000)).toMatch(/MP4/);
    expect(heroUploadProblem("image", "image/png", 2_000_000)).toBeNull();
    expect(heroUploadProblem("image", "image/gif", 1000)).toMatch(/isn't allowed/);
    expect(heroUploadProblem("image", "image/png", 0)).toMatch(/empty/);
  });
  it("gives each upload a fresh name", () => {
    expect(heroUploadPath("video", "video/mp4", 5)).toBe("hero/video-5.mp4");
    expect(heroUploadPath("image", "image/png", 6)).toBe("hero/image-6.png");
    expect(heroUploadPath("image", "image/jpeg", 7)).toBe("hero/image-7.jpg");
  });
});
