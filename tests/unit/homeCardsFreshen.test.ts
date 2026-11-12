/* Home cards saved before the renames read with today's words. */

import { validateHomeCards, freshenCardText } from "@/lib/homeCards";

it("renames tours and the pool choices in saved card text", () => {
  expect(freshenCardText("Exclusive (up to 30): ₱6,000")).toBe("Private pool (up to 30): ₱6,000");
  expect(freshenCardText("Exclusive: ₱12,000 · Shared: ₱400 per guest")).toBe("Private pool: ₱12,000 · Shared pool: ₱400 per guest");
  expect(freshenCardText("The Day and Night Tours together")).toBe("The Day and Night Stays together");
  const v = validateHomeCards([{ id: "day", icon: "sun", title: "Day Tour", description: "Resort use 7:00 AM — 5:00 PM.", price: "from ₱200", unit: "/tour", details: ["Shared: ₱200 per guest"], button: null }]);
  expect(v.ok && v.cards[0]).toMatchObject({ title: "Day Stay", unit: "/stay", details: ["Shared pool: ₱200 per guest"] });
});
