// The "Tours & Room Add-ons" cards on Home: automatic until staff save
// their own, and whatever staff save is cleaned before it is stored.
import { automaticHomeCards, validateHomeCards, HOME_CARDS_MAX } from "@/lib/homeCards";

const card = (over: Record<string, unknown> = {}) => ({
  id: "day", icon: "sun", title: "Day Tour", description: "Resort use", price: "from ₱200", unit: "/guest",
  details: ["Shared: ₱200 per guest"], button: null, ...over,
});

describe("automaticHomeCards", () => {
  it("builds the tour cards and a room card from the real rooms", () => {
    const cards = automaticHomeCards([{ price: 2000 }, { price: 2500 }]);
    expect(cards.map((c) => c.id)).toEqual(["day", "night", "wholeday", "room"]);
    const room = cards.find((c) => c.id === "room")!;
    expect(room.price).toBe("from ₱2,000");
    expect(room.button).toEqual({ label: "VIEW ROOMS", link: "Rooms" });
    expect(cards.find((c) => c.id === "wholeday")!.price.startsWith("from")).toBe(false);
  });

  it("leaves the room card out when there are no rooms", () => {
    expect(automaticHomeCards([]).some((c) => c.id === "room")).toBe(false);
  });

  it("is itself a valid list, so saving it unchanged works", () => {
    expect(validateHomeCards(automaticHomeCards([{ price: 2000 }])).ok).toBe(true);
  });
});

describe("validateHomeCards", () => {
  it("refuses an empty list and too many cards", () => {
    expect(validateHomeCards([]).ok).toBe(false);
    expect(validateHomeCards(Array.from({ length: HOME_CARDS_MAX + 1 }, (_, i) => card({ id: `c${i}` }))).ok).toBe(false);
  });

  it("needs a title on every card", () => {
    const v = validateHomeCards([card(), card({ id: "x", title: "  " })]);
    expect(v).toEqual({ ok: false, error: "Card 2 needs a title." });
  });

  it("cleans text: no tags, single spaces, blank lines dropped", () => {
    const v = validateHomeCards([card({ title: "  Day   <b>Tour</b> ", details: ["  one ", "", "two"] })]);
    expect(v.ok && v.cards[0].title).toBe("Day b Tour /b");
    expect(v.ok && v.cards[0].details).toEqual(["one", "two"]);
  });

  it("falls back to a safe icon and makes ids unique", () => {
    const v = validateHomeCards([card({ icon: "skull" }), card()]);
    expect(v.ok && v.cards[0].icon).toBe("star");
    expect(v.ok && new Set(v.cards.map((c) => c.id)).size).toBe(2);
  });

  it("keeps a button only with a label and a real page", () => {
    expect(validateHomeCards([card({ button: { label: "Go", link: "Nowhere" } })]).ok).toBe(false);
    const ok = validateHomeCards([card({ button: { label: "VIEW ROOMS", link: "Rooms" } })]);
    expect(ok.ok && ok.cards[0].button).toEqual({ label: "VIEW ROOMS", link: "Rooms" });
    const blank = validateHomeCards([card({ button: { label: "  ", link: "Rooms" } })]);
    expect(blank.ok && blank.cards[0].button).toBeNull();
  });
});
