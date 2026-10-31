"use client";
import { useState } from "react";
import { ProfileMenu } from "@/components/admin/ProfileMenu";
export default function P() {
  const [said, setSaid] = useState("");
  return (
    <div style={{ height: "100dvh", background: "#080706" }}>
      <p id="said" style={{ color: "#fff" }}>{said}</p>
      {/* The phone side menu: fixed, full screen under the top bar, z-index 80, like Admin.tsx. */}
      <div style={{ position: "fixed", inset: "56px 0 0 0", zIndex: 80, background: "#121212", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px 16px", borderTop: "1px solid #222", flexShrink: 0 }}>
          <ProfileMenu variant="sidebar" onAccountSettings={() => setSaid("account")} onSignOut={() => setSaid("signout")} />
        </div>
      </div>
    </div>
  );
}
