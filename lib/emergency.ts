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

/** Why these files can't be sent, or null. */
export function proofProblem(files: unknown): string | null {
  if (!Array.isArray(files) || files.length === 0) return "Attach at least one photo or PDF of your proof.";
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
