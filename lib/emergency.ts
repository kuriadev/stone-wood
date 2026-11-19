// ── Emergency requests
//
// Inside the date-change notice window (Rates & Settings) a guest can't
// cancel or move their booking online. If an emergency stops them coming --
// illness, injury, a death in the family -- they send the resort what
// happened with proof, from Manage booking. It lands in Guest Messages as an
// "Emergency" message; staff look at the proof and approve it (then move the
// booking to a free date at no charge) or decline it. The guest is emailed
// either way.
//
// Pure: the guest form and the server both use these limits.

export const EMERGENCY_TYPE = "Emergency";

/** What guests and staff read for an "Emergency" message (owner, 2026-11-19).
 *  Inside the notice window a guest can't cancel online; a last-minute
 *  "Cancellation request" goes to the resort instead, with a reason and
 *  proof, and is treated as an emergency. The stored type stays "Emergency"
 *  so older messages keep working. */
export const CANCEL_REQUEST_LABEL = "Cancellation request";

/** Where a booking's latest cancellation request stands, for Manage booking.
 *  "Approved" unlocks cancelling and changing the date online, even inside
 *  the notice window. */
export type CancelRequestState = { status: "Pending" | "Approved" | "Declined"; note: string | null; sentAt: string } | null;

/** A guest cancelled their booking from Manage booking (owner's rule,
 *  2026-11-19): the booking is cancelled straight away, no approval, and
 *  this message tells staff it happened and why. Notification only: Guest
 *  Messages shows it as "Booking Cancelled", with nothing to approve. */
export const CANCELLATION_TYPE = "Cancellation";

/** Proof files per request. */
export const PROOF_MAX_FILES = 3;
/** A PDF as picked (photos are compressed in the browser first). */
export const PROOF_PDF_MAX_BYTES = 1_500_000;
/** All the proof together, as sent (data: URLs). Under the 4.5 MB request
 *  limit of the host, with room for the rest of the request. */
export const PROOF_TOTAL_MAX_CHARS = 4_000_000;
export const EMERGENCY_MESSAGE_MIN = 20;
export const EMERGENCY_MESSAGE_MAX = 2000;

export type ProofFile = { name: string; type: string; data: string };

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Why these files can't be sent, or null. Proof is optional (owner,
 *  2026-11-19): a reason is required, a picture helps staff decide. */
export function proofProblem(files: unknown): string | null {
  if (files === undefined || files === null || (Array.isArray(files) && files.length === 0)) return null;
  if (!Array.isArray(files)) return "One of the files couldn't be read. Attach it again.";
  if (files.length > PROOF_MAX_FILES) return `Attach at most ${PROOF_MAX_FILES} files.`;
  let total = 0;
  for (const f of files as Partial<ProofFile>[]) {
    if (!f || typeof f.data !== "string" || typeof f.type !== "string") return "One of the files couldn't be read. Attach it again.";
    if (!OK_TYPES.includes(f.type)) return "Proof must be a photo (JPG, PNG or WebP) or a PDF.";
    if (!f.data.startsWith(`data:${f.type};base64,`)) return "One of the files couldn't be read. Attach it again.";
    total += f.data.length;
  }
  if (total > PROOF_TOTAL_MAX_CHARS) return "The files are too large together. Attach fewer, or smaller ones.";
  return null;
}

/** Safe to keep: a short plain file name. */
export function cleanProofName(name: unknown, i: number): string {
  const n = String(name ?? "").replace(/[^\w .()-]/g, "").trim().slice(0, 80);
  return n || `proof-${i + 1}`;
}
