"use client";

// "Forgot password?" on the admin sign-in page (lib/passwordReset.server.ts).
// One pop-up, three steps:
//   1. Username or email → a 6-digit code to the account's confirmed email.
//   2. The code (typed or pasted) → signed in.
//   3. A suggested new password: save one, or "Not now".
// onSignedIn opens the admin once step 3 is done or skipped.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { gold, goldBtn } from "@/lib/styles";

type Step = "find" | "code" | "newpw";
const PASSWORD_MIN = 8;
const nowMs = () => Date.now();

export function ForgotPassword({ open, onOpenChange, initialLogin, onSignedIn, C }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialLogin: string;
  onSignedIn: (name: string) => void;
  C: { textH: string; textB: string; textS: string; goldInk: string; border: string };
}) {
  const [step, setStep] = useState<Step>("find");
  const [login, setLogin] = useState(initialLogin);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const resendIn = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  useEffect(() => {
    if (resendAt <= nowMs()) return;
    const t = setInterval(() => { setClock(nowMs()); if (nowMs() >= resendAt) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  }, [resendAt]);

  const reset = () => {
    setStep("find"); setChallenge(""); setCode(""); setResetToken(""); setPw(""); setPw2(""); setMsg(null);
  };
  const close = (o: boolean) => {
    if (o) { setLogin(initialLogin); onOpenChange(true); return; }
    // Closing after signing in still opens the admin.
    if (step === "newpw") { onSignedIn(name); }
    reset();
    onOpenChange(false);
  };

  const send = async () => {
    if (!login.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login.trim() }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (typeof json?.retryAfter === "number") { setResendAt(nowMs() + json.retryAfter * 1000); setClock(nowMs()); }
        setMsg({ text: json?.error ?? "The code couldn't be sent.", bad: true });
        return;
      }
      setChallenge(json.challenge); setCode(""); setStep("code");
      setResendAt(nowMs() + (Number(json.resendIn) || 60) * 1000); setClock(nowMs());
      setMsg({ text: "If the account has a confirmed email, a 6-digit code is on its way. It works for 10 minutes. Check Spam too." });
    } catch {
      setMsg({ text: "Could not reach the server.", bad: true });
    } finally { setBusy(false); }
  };

  const verify = async (typed: string) => {
    if (busy || typed.length !== 6) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login.trim(), challenge, code: typed }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setMsg({ text: json?.error ?? "That code didn't work.", bad: true }); return; }
      setResetToken(json.resetToken); setName(json.staff?.name ?? "");
      setStep("newpw"); setMsg(null);
    } catch {
      setMsg({ text: "Could not reach the server.", bad: true });
    } finally { setBusy(false); }
  };

  const savePw = async () => {
    if (busy) return;
    if (pw.length < PASSWORD_MIN) { setMsg({ text: `Use at least ${PASSWORD_MIN} characters.`, bad: true }); return; }
    if (pw !== pw2) { setMsg({ text: "The two passwords don't match.", bad: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resetToken, password: pw }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setMsg({ text: json?.error ?? "The password couldn't be saved.", bad: true }); return; }
      const who = name;
      reset(); onOpenChange(false); onSignedIn(who);
    } catch {
      setMsg({ text: "Could not reach the server.", bad: true });
    } finally { setBusy(false); }
  };

  const title = step === "find" ? "Forgot your password?" : step === "code" ? "Check your email" : "Create a new password";
  const sub = step === "find" ? "Enter your username or the email on your account. We'll send a 6-digit code to that account's email."
    : step === "code" ? "Enter the 6-digit code from the email to sign in."
    : `You're signed in${name ? `, ${name}` : ""}. Set a new password now so you won't need a code next time.`;
  const icon = step === "find" ? "lock" : step === "code" ? "mail" : "shield-alert";
  const btn = { ...goldBtn, width: "100%", minHeight: 48 } as const;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent style={{ maxWidth: 440 }}>
        <DialogHeader style={{ alignItems: "center", textAlign: "center" }}>
          <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: `${gold}1f`, color: C.goldInk, margin: "0 auto 6px" }}>
            <Icon name={icon} size={22} strokeWidth={1.6} />
          </span>
          <DialogTitle style={{ color: C.textH, fontSize: 22, fontWeight: 500 }}>{title}</DialogTitle>
          <DialogDescription style={{ color: C.textS, fontSize: 13.5, lineHeight: 1.6 }}>{sub}</DialogDescription>
        </DialogHeader>

        {step === "find" && (
          <>
            <div>
              <Label htmlFor="fp-login" style={{ color: C.goldInk, fontSize: 11.5, letterSpacing: 1.6, display: "block", marginBottom: 8 }}>USERNAME OR EMAIL</Label>
              <Input id="fp-login" autoFocus value={login} maxLength={120} autoComplete="username" style={{ height: 46 }}
                onChange={(e) => { setLogin(e.target.value); setMsg(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
            </div>
            <Button className="sw-btn" disabled={!login.trim() || busy || resendIn > 0} onClick={() => void send()} style={{ ...btn, opacity: !login.trim() || busy ? 0.5 : 1 }}>
              {busy ? "SENDING…" : resendIn > 0 ? `TRY AGAIN IN ${resendIn}s` : "SEND CODE"}
            </Button>
          </>
        )}

        {step === "code" && (
          <>
            <Input aria-label="6-digit code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy}
              placeholder="••••••" style={{ height: 56, textAlign: "center", fontSize: 26, letterSpacing: 10, fontWeight: 600 }}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); setMsg(null); if (v.length === 6) void verify(v); }}
              onPaste={(e) => { const v = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); if (v.length === 6) { e.preventDefault(); setCode(v); void verify(v); } }} />
            <Button className="sw-btn" disabled={code.length !== 6 || busy} onClick={() => void verify(code)} style={{ ...btn, opacity: code.length !== 6 || busy ? 0.5 : 1 }}>
              {busy ? "CHECKING…" : "VERIFY & SIGN IN"}
            </Button>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <button type="button" onClick={() => { setStep("find"); setMsg(null); }} style={{ background: "none", border: "none", color: C.textS, cursor: "pointer", padding: 4 }}>← Change username</button>
              <button type="button" disabled={busy || resendIn > 0} onClick={() => void send()}
                style={{ background: "none", border: "none", color: resendIn > 0 ? C.textS : C.goldInk, cursor: resendIn > 0 ? "default" : "pointer", textDecoration: resendIn > 0 ? "none" : "underline", padding: 4 }}>
                {resendIn > 0 ? `New code in ${resendIn}s` : "Send a new code"}
              </button>
            </div>
          </>
        )}

        {step === "newpw" && (
          <>
            <div>
              <Label htmlFor="fp-pw" style={{ color: C.goldInk, fontSize: 11.5, letterSpacing: 1.6, display: "block", marginBottom: 8 }}>NEW PASSWORD</Label>
              <div style={{ position: "relative" }}>
                <Input id="fp-pw" autoFocus type={showPw ? "text" : "password"} value={pw} maxLength={128} autoComplete="new-password" style={{ height: 46, paddingRight: 44 }}
                  onChange={(e) => { setPw(e.target.value); setMsg(null); }} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.goldInk, cursor: "pointer" }}>
                  <Icon name={showPw ? "eye-off" : "eye"} size={16} />
                </button>
              </div>
              <p style={{ color: C.textS, fontSize: 12, margin: "6px 0 0" }}>At least {PASSWORD_MIN} characters.</p>
            </div>
            <div>
              <Label htmlFor="fp-pw2" style={{ color: C.goldInk, fontSize: 11.5, letterSpacing: 1.6, display: "block", marginBottom: 8 }}>TYPE IT AGAIN</Label>
              <Input id="fp-pw2" type={showPw ? "text" : "password"} value={pw2} maxLength={128} autoComplete="new-password" style={{ height: 46 }}
                onChange={(e) => { setPw2(e.target.value); setMsg(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void savePw(); }} />
            </div>
            <Button className="sw-btn" disabled={busy || !pw || !pw2} onClick={() => void savePw()} style={{ ...btn, opacity: busy || !pw || !pw2 ? 0.5 : 1 }}>
              {busy ? "SAVING…" : "SAVE NEW PASSWORD"}
            </Button>
            <button type="button" onClick={() => close(false)} style={{ background: "none", border: "none", color: C.textS, cursor: "pointer", fontSize: 12.5, padding: 4 }}>
              Not now, go to the admin
            </button>
          </>
        )}

        {msg && <p role={msg.bad ? "alert" : "status"} style={{ color: msg.bad ? "#e07070" : C.textS, fontSize: 12.5, margin: 0, lineHeight: 1.55, textAlign: "center" }}>{msg.text}</p>}
      </DialogContent>
    </Dialog>
  );
}
