/* Photos saved as data: URLs are stored as files and replaced by their
 * link; links are left alone; a storage failure keeps the photo inline. */

const uploads: { path: string; type: string; size: number }[] = [];
let failUpload = false;
const storageApi = {
  getBucket: jest.fn(async () => ({ data: {}, error: null })),
  createBucket: jest.fn(async () => ({ data: {}, error: null })),
  from: () => ({
    upload: jest.fn(async (path: string, bytes: Buffer, o: { contentType: string }) => {
      if (failUpload) return { error: { message: "network down" } };
      if (uploads.some((u) => u.path === path)) return { error: { message: "The resource already exists" } };
      uploads.push({ path, type: o.contentType, size: bytes.length });
      return { error: null };
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/site-media/${path}` } }),
  }),
};
jest.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ storage: storageApi }) }));

import { storeImage, storeImages, isDataImage } from "@/lib/mediaStore.server";
import { scrubDetails } from "@/lib/activity.server";

const JPEG = `data:image/jpeg;base64,${Buffer.from("fake-jpeg-bytes").toString("base64")}`;

beforeEach(() => { uploads.length = 0; failUpload = false; });

it("stores a data: URL once and returns its link", async () => {
  const url = await storeImage(JPEG, "rooms");
  expect(url).toMatch(/^https:\/\/cdn\.example\/site-media\/rooms\/[0-9a-f]{32}\.jpg$/);
  expect(uploads).toEqual([{ path: url.split("site-media/")[1], type: "image/jpeg", size: 15 }]);
  // The same photo again: same name, no second file.
  expect(await storeImage(JPEG, "rooms")).toBe(url);
  expect(uploads).toHaveLength(1);
});

it("leaves links alone and keeps the photo inline if storage fails", async () => {
  expect(await storeImage("https://images.unsplash.com/x.jpg", "rooms")).toBe("https://images.unsplash.com/x.jpg");
  failUpload = true;
  expect(await storeImage(JPEG, "rooms")).toBe(JPEG);
  const list = await storeImages(["https://a/b.jpg", JPEG], "gallery");
  expect(list).toEqual(["https://a/b.jpg", JPEG]);
  expect(isDataImage(JPEG)).toBe(true);
  expect(isDataImage("https://a/b.jpg")).toBe(false);
});

it("keeps photos out of activity details", () => {
  const big = `data:image/jpeg;base64,${"A".repeat(500)}`;
  expect(scrubDetails({ cover: { from: big, to: "https://x/y.jpg" }, gallery: [big, "ok"], n: 3 }))
    .toEqual({ cover: { from: "(photo)", to: "https://x/y.jpg" }, gallery: ["(photo)", "ok"], n: 3 });
});
