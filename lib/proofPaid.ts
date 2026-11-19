// Pending proof of payment (components/admin/ProofQueue.tsx): which confirm
// button the card shows. Pure, so it is tested on its own.

/** What the guest actually paid, so only that button shows: the receipt
 *  reader's amounts first (the whole total, or at least the 50%), then what
 *  the guest chose on Book Now. Staff can still pick the other one from the
 *  small link under the button if the receipt says otherwise. */
export function paidAs(p: { payChoice: "Downpayment" | "Full"; amountDue: number; booking: { total: number }; ocr?: { amounts?: number[] } }): "Downpayment" | "Full" {
  const amounts = p.ocr?.amounts ?? [];
  const total = p.booking.total;
  if (total > 0 && amounts.some((a) => a >= total)) return "Full";
  const half = Math.ceil(total / 2);
  if (amounts.some((a) => a >= half && a < total)) return "Downpayment";
  return p.payChoice;
}
