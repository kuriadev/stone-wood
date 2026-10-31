import { findRef, isRef, refPrefixFor } from "@/lib/bookingRef";
import { referenceIn } from "@/lib/autoReply";

describe("booking references", () => {
  it("start with the booking type", () => {
    expect(refPrefixFor("Day")).toBe("DT");
    expect(refPrefixFor("Night")).toBe("NT");
    expect(refPrefixFor("WholeDay")).toBe("SC");
  });
  it("are found in a guest's message however they type them", () => {
    expect(findRef("Hi, my booking is dt10201 thanks")).toBe("DT-10201");
    expect(findRef("NT 10202 please")).toBe("NT-10202");
    expect(findRef("about SC-10203")).toBe("SC-10203");
    expect(findRef("old one SW-10141")).toBe("SW-10141");
    expect(findRef("no reference here")).toBeNull();
    expect(referenceIn("re: nt-10202")).toBe("NT-10202");
  });
  it("recognise a whole reference, old and new", () => {
    for (const r of ["DT-10201", "NT-10202", "SC-10203", "SW-10141"]) expect(isRef(r)).toBe(true);
    expect(isRef("XX-10201")).toBe(false);
  });
});
