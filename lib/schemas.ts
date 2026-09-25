/**
 * Zod schemas for everything crossing a trust boundary.
 *
 * Deliberately built ON TOP of `lib/validators.ts` rather than restating its
 * rules. `isValidEmail`, `isValidPHNumber`, `isValidName` and the sanitizers
 * stay the single source of truth for what "valid" means; Zod supplies the
 * shape, the coercion and the error reporting around them. Rewriting those
 * rules as Zod regexes would create a second definition that silently drifts
 * from the first — and both the client forms and the API routes depend on
 * them agreeing.
 *
 * Every primitive carries the SAME message for a missing/wrong-typed value
 * as for an invalid one. Without that, omitting a field surfaced Zod's own
 * wording ("expected string, received undefined") to the caller, while a
 * malformed value got the human sentence — two different voices for the same
 * mistake.
 *
 * Scope: these cover SHAPE and PRIMITIVE validity only. Anything needing a
 * database lookup — is that package still active, is the date closed, is
 * there capacity — stays in `lib/bookingQuote.ts`, which is the server's
 * source of truth for whether a booking can actually be made.
 */
import { z } from "zod";
import {
  GUESTS_MAX,
  GUESTS_MIN,
  NOTES_MAX,
  OVERTIME_MAX,
  OVERTIME_MIN,
  isValidEmail,
  isValidName,
  isValidPHNumber,
  parseDateStr,
  sanitizeContact,
  sanitizeName,
  sanitizeNotes,
} from "@/lib/validators";
import { isGmailAddress } from "@/lib/validators";
import { isMaintenanceReason } from "@/types/maintenance";

// ── Primitives ───────────────────────────────────────────────────────

/** "YYYY-MM-DD", and a date that actually exists. `parseDateStr` rejects
 *  2026-02-31, which a bare regex would wave through. */
export const dateStr = z
  .string({ message: "A valid YYYY-MM-DD date is required." })
  .refine((s) => parseDateStr(s) !== null, "A valid YYYY-MM-DD date is required.");

/** Sanitised on the way in, then checked — same order as the booking
 *  pipeline, so a name that the form would have cleaned is not rejected
 *  here for containing a stray character. */
export const guestName = z
  .string({ message: "A valid name is required." })
  .transform((s) => sanitizeName(s).trim())
  .refine(isValidName, "A valid name is required.");

export const email = z
  .string({ message: "A valid email address is required." })
  .transform((s) => s.trim())
  .refine(isValidEmail, "A valid email address is required.");

export const phoneNumber = z
  .string({ message: "A valid PH mobile number (09XXXXXXXXX) is required." })
  .transform(sanitizeContact)
  .refine(isValidPHNumber, "A valid PH mobile number (09XXXXXXXXX) is required.");

export const notes = z.string({ message: "Notes must be text." }).transform(sanitizeNotes).pipe(z.string().max(NOTES_MAX));

export const guests = z.coerce
  .number()
  .int("Guest count must be a whole number.")
  .min(GUESTS_MIN, `At least ${GUESTS_MIN} guest is required.`)
  .max(GUESTS_MAX, `Maximum ${GUESTS_MAX} guests per booking.`);

export const overtime = z.coerce
  .number()
  .int()
  .min(OVERTIME_MIN)
  .max(OVERTIME_MAX, `Overtime is capped at ${OVERTIME_MAX} hours.`);

export const bookingSlot = z.enum(["Day", "Night", "WholeDay"]);
export const bookingTier = z.enum(["Shared", "Exclusive"]);
export const bookingResource = z.enum(["Pool", "Venue", "Pool+Venue"]);

/** Room ids: positive integers, de-duplicated, order preserved. */
export const roomIds = z
  .array(z.coerce.number().int().positive())
  .transform((ids) => [...new Set(ids)]);

// ── Request payloads ─────────────────────────────────────────────────

/** POST /api/closed-dates */
export const closeDateInput = z.object({
  date: dateStr,
  reason: notes.optional().default(""),
});

/** PATCH /api/maintenance */
export const maintenanceInput = z.object({
  active: z.boolean({ message: "`active` must be true or false." }),
  reason: z
    .string()
    .refine(isMaintenanceReason, "`reason` must be one of the three maintenance reasons."),
  message: notes.optional().default(""),
});

/** The guest-facing contact form. */
export const customerMessageInput = z.object({
  name: guestName,
  email,
  message: z
    .string({ message: "A message is required." })
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "A message is required.")),
});

/**
 * The public Customer Service form.
 *
 * Stricter than `customerMessageInput` in two ways, both carried over from
 * what the form already enforced rather than invented here:
 *   • the address must be on gmail.com, not merely a valid address
 *   • the message needs at least 10 characters, so "hi" is not a support
 *     ticket
 * `CUSTOMER_MESSAGE_MAX` matches the textarea's own cap, so the field and
 * the schema cannot disagree about the limit.
 */
export const CUSTOMER_MESSAGE_MIN = 10;
export const CUSTOMER_MESSAGE_MAX = 1000;

export const customerServiceForm = z.object({
  name: guestName,
  email: z
    .string({ message: "A Gmail address is required." })
    .transform((v) => v.trim())
    .refine(isGmailAddress, "Please enter a valid Gmail address."),
  // No .default() here: the form supplies it via defaultValues, and a
  // defaulted field makes the schema's input type optional while its
  // output stays required, which react-hook-form's resolver rejects.
  type: z.string().min(1),
  message: z
    .string({ message: "A message is required." })
    .max(CUSTOMER_MESSAGE_MAX)
    .refine(
      (v) => v.trim().length >= CUSTOMER_MESSAGE_MIN,
      `Please write at least ${CUSTOMER_MESSAGE_MIN} characters.`,
    ),
});

export type CustomerServiceForm = z.infer<typeof customerServiceForm>;

/**
 * The Cancel Booking lookup.
 *
 * Deliberately only requires both fields to be non-empty — the same rule the
 * form already applied. No pattern on the reference (walk-ins and legacy
 * rows need not match today's "SW-#####" shape, and rejecting a real one
 * client-side would lock a guest out of cancelling) and no email format
 * check (the server matches the address against the stored booking, which is
 * the only authority on whether it is the right one).
 *
 * What it does add is normalisation: the trim and lower-casing the component
 * used to do by hand at two separate call sites now happen once, here.
 */
export const cancelBookingLookup = z.object({
  reference: z
    .string({ message: "Enter your booking reference." })
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Enter your booking reference.")),
  email: z
    .string({ message: "Enter the email you booked with." })
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().min(1, "Enter the email you booked with.")),
});

export type CancelBookingLookup = z.infer<typeof cancelBookingLookup>;

export type CloseDateInput = z.infer<typeof closeDateInput>;
export type MaintenanceInput = z.infer<typeof maintenanceInput>;
export type CustomerMessageInput = z.infer<typeof customerMessageInput>;

// ── Helper ───────────────────────────────────────────────────────────

/**
 * Parse an untrusted payload, returning either the clean value or the first
 * human-readable problem. Routes stay flat: no try/catch, no ZodError
 * handling, and the message is already safe to hand back to a caller.
 */
export function parseInput<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  return { ok: false, error: first?.message ?? "Invalid request." };
}
