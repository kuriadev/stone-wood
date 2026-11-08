// ── The e-wallets that can pay a QR Ph code ──
//
// QR Ph is the resort's one online way to pay (PayMongo shows the code);
// the guest scans it with whichever e-wallet they use. Shown under the code
// on the Book Now payment step and the front desk's QR pop-up. The list and
// the icons live in lib/labels.ts (QRPH_WALLETS) and public/images/wallets.

import { QRPH_WALLETS } from "@/lib/labels";

export function WalletBadges({ muted, line }: { muted: string; line: string }) {
  return (
    <div role="list" aria-label="E-wallets that can pay" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {QRPH_WALLETS.map((w) => (
        <span key={w.name} role="listitem" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "inherit", border: `1px solid ${line}`, borderRadius: 999, padding: "4px 11px 4px 4px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={w.icon} alt="" width={22} height={22} loading="lazy" decoding="async" style={{ width: 22, height: 22, borderRadius: 6, display: "block" }} />
          {w.name}
        </span>
      ))}
      <span style={{ fontSize: 11.5, color: muted }}>or any QR Ph e-wallet</span>
    </div>
  );
}
