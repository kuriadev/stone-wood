// ── Proof of payment: storing and showing the receipts (server only)
//
// Receipts carry the guest's name, number and money, so they go in a
// PRIVATE bucket ("payment-proofs"). Staff see them through a signed link
// that works for an hour (GET /api/payment-proofs), never a public URL.
// The table is supabase/migrations/20261115120000_payment_proofs.sql.

import { getSupabaseAdmin } from "@/lib/supabase";
import { cleanAccount, cleanReference, isSampleReceipt, validAccount, validReference, validSenderName } from "@/lib/receiptOcr";

export const PROOF_BUCKET = "payment-proofs";
/** A JPEG made by the browser (lib/receiptImage.ts) is well under this. */
const MAX_BYTES = 4 * 1024 * 1024;
const DATA_URL = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export type ProofStatus = "Submitted" | "Approved" | "Rejected" | "Replaced";
export type PayChoice = "Downpayment" | "Full";

export interface ProofOcr {
  /** The reference number the guest typed. */
  reference?: string | null;
  /** The reference number read off the receipt. */
  ocrReference?: string | null;
  senderName?: string | null;
  senderAccount?: string | null;
  date?: string | null;
  amounts?: number[];
  amountMatch?: boolean;
  nameFound?: boolean;
  confidence?: number;
  sharpness?: number;
}

export interface ProofRow {
  id: number;
  booking_id: string;
  path: string;
  status: ProofStatus;
  pay_choice: PayChoice;
  amount_due: number;
  ocr: ProofOcr;
  reference: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_as: PayChoice | null;
  reject_reason: string | null;
}

/** The migration hasn't been applied yet. */
export const proofsTableMissing = (msg: string) => /payment_proofs|relation .* does not exist|schema cache/i.test(msg);

let bucketReady: Promise<boolean> | null = null;
function ensureBucket(): Promise<boolean> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = getSupabaseAdmin().storage;
      if (!(await storage.getBucket(PROOF_BUCKET)).error) return true;
      const made = await storage.createBucket(PROOF_BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
      return !made.error || /exists/i.test(made.error.message);
    })().catch(() => { bucketReady = null; return false; });
  }
  return bucketReady;
}

/** Check a receipt sent as a data: URL. */
export function checkProofImage(raw: unknown): { ok: true; type: string; bytes: Buffer } | { ok: false; error: string } {
  const m = typeof raw === "string" ? DATA_URL.exec(raw) : null;
  if (!m) return { ok: false, error: "Attach a photo or screenshot of your receipt." };
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length < 2_000) return { ok: false, error: "That picture is too small to read. Please upload a clear screenshot." };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "That picture is too large. Please upload a screenshot under 4 MB." };
  return { ok: true, type: m[1], bytes };
}

/** Store the receipt; returns its path in the bucket. */
export async function saveProofImage(bookingId: string, img: { type: string; bytes: Buffer }): Promise<string> {
  if (!(await ensureBucket())) throw new Error("The receipt storage isn't available.");
  const ext = img.type === "image/png" ? "png" : img.type === "image/webp" ? "webp" : "jpg";
  const path = `${bookingId}/${Date.now()}.${ext}`;
  const up = await getSupabaseAdmin().storage.from(PROOF_BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return path;
}

/** A link to the receipt that works for an hour. */
export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().storage.from(PROOF_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** The sender's details and reference are filled in and real; null when fine,
 *  else what the guest has to fix. */
export function senderProblem(o: ProofOcr): string | null {
  if (!o.senderName) return "Enter the sender name: letters and name punctuation only.";
  if (!o.senderAccount) return "Enter the GCash number you paid from (11 digits, starting with 09).";
  if (!o.reference) return "Enter the reference number from your receipt (8–20 digits).";
  if (isSampleReceipt(o.reference) || isSampleReceipt(o.ocrReference)) return "That's the sample receipt. Please upload the receipt from your own GCash payment.";
  return null;
}

/** What the browser read off the receipt, kept small and typed. */
export function cleanOcr(raw: unknown): ProofOcr {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, n) || null : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined);
  const ref = cleanReference(typeof o.reference === "string" ? o.reference : "");
  const name = typeof o.senderName === "string" ? o.senderName.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const account = cleanAccount(typeof o.senderAccount === "string" ? o.senderAccount : "");
  return {
    reference: validReference(ref) ? ref : null,
    ocrReference: str(o.ocrReference, 40),
    senderName: validSenderName(name) ? name : null,
    senderAccount: validAccount(account) ? account : null,
    date: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
    amounts: Array.isArray(o.amounts) ? o.amounts.map(num).filter((n): n is number => n !== undefined).slice(0, 8) : [],
    amountMatch: o.amountMatch === true,
    nameFound: o.nameFound === true,
    confidence: num(o.confidence),
    sharpness: num(o.sharpness),
  };
}
