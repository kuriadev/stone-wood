/* Why an online booking is awaiting approval, read back from its notes. */

import { reviewReasons, guestNotesOnly } from "@/lib/reviewReasons";

it("names a double booking, a wrong amount and a group booked twice", () => {
  const notes = "Birthday party ⚠ CHECK: That Day Stay is already booked (taken while the guest was paying). ⚠ CHECK: paid ₱500 but the down payment is ₱600. ⚠ CHECK: possibly the same group as DT-10001 (same name; one has the events venue, the other a shared pool stay).";
  const r = reviewReasons(notes);
  expect(r.map((x) => x.kind)).toEqual(["taken", "amount", "twice"]);
  expect(r[0].title).toBe("Double booking");
  expect(r[0].cancelText).toMatch(/double booking/);
  expect(r[0].cancelText).toMatch(/carries over/);
  expect(guestNotesOnly(notes)).toBe("Birthday party");
});

it("is empty for an ordinary booking", () => {
  expect(reviewReasons("Please prepare the grill")).toEqual([]);
  expect(reviewReasons(undefined)).toEqual([]);
});
