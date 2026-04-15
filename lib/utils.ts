import type { Room } from "@/types/room";

/** Philippine Peso formatter */
export function fmt(n: number): string {
  return `₱${Number(n).toLocaleString()}`;
}

/** Calculate total booking price */
export function calcTotal(
  guests: number,
  overtime: number,
  selRooms: number[],
  allRooms: Room[]
): number {
  let t = 6000;
  if (guests > 30) t += (guests - 30) * 100;
  if (overtime > 0) t += overtime * 500;
  selRooms.forEach((rid) => {
    const r = allRooms.find((x) => x.id === rid);
    if (r) t += r.price;
  });
  return t;
}

/** Format a countdown timer (seconds → MM:SS) */
export function fmtTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Format a date string YYYY-MM-DD → "January 1, 2026" */
export function fmtDate(ds: string): string {
  if (!ds) return "Select a date";
  const [y, m, d] = ds.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
    "en-PH",
    { month: "long", day: "numeric", year: "numeric" }
  );
}

/** Generate a new booking ID based on existing count */
export function genBookingId(count: number): string {
  return `SW-${10007 + count}`;
}
