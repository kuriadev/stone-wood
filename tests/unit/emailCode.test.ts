// The email code Book Now asks for before payment: a code is emailed, the
// browser holds a sealed challenge with only a hash of it, and a right code
// becomes a proof for that one address.
import {
  newEmailCode, checkEmailCode, emailProofValid, challengeId, EMAIL_CODE_TTL_MS, EMAIL_PROOF_TTL_MS,
} from "@/lib/emailCode.server";

const NOW = Date.parse("2026-11-08T10:00:00+08:00");

describe("email codes", () => {
  it("are six digits, and the challenge doesn't contain the code", () => {
    for (let i = 0; i < 20; i++) {
      const { code, challenge } = newEmailCode("guest@example.com", NOW);
      expect(code).toMatch(/^\d{6}$/);
      expect(Buffer.from(challenge.split(".")[0], "base64url").toString()).not.toContain(code);
    }
  });

  it("turn the right code into a proof for that address, whatever its capitals", () => {
    const { code, challenge } = newEmailCode("Guest@Example.com ", NOW);
    const r = checkEmailCode(challenge, "guest@example.com", code, NOW + 60_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(emailProofValid(r.proof, "GUEST@example.com", NOW + 120_000)).toBe(true);
    expect(emailProofValid(r.proof, "someone@example.com", NOW + 120_000)).toBe(false);
  });

  it("refuse a wrong code, another address, and an expired code", () => {
    const { code, challenge } = newEmailCode("guest@example.com", NOW);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(checkEmailCode(challenge, "guest@example.com", wrong, NOW)).toEqual({ ok: false, reason: "wrong" });
    expect(checkEmailCode(challenge, "other@example.com", code, NOW)).toEqual({ ok: false, reason: "other-email" });
    expect(checkEmailCode(challenge, "guest@example.com", code, NOW + EMAIL_CODE_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("can't be edited in the browser", () => {
    const { code, challenge } = newEmailCode("guest@example.com", NOW);
    const [body] = challenge.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    const moved = Buffer.from(JSON.stringify({ ...payload, e: "attacker@example.com" })).toString("base64url");
    const forged = `${moved}.${challenge.split(".")[1]}`;
    expect(checkEmailCode(forged, "attacker@example.com", code, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(challengeId(forged)).toBeNull();
    expect(challengeId(challenge)).toBe(payload.n);
  });

  it("give a proof that runs out, and can't be made up", () => {
    const { code, challenge } = newEmailCode("guest@example.com", NOW);
    const r = checkEmailCode(challenge, "guest@example.com", code, NOW);
    if (!r.ok) throw new Error("expected a proof");
    expect(emailProofValid(r.proof, "guest@example.com", NOW + EMAIL_PROOF_TTL_MS - 1)).toBe(true);
    expect(emailProofValid(r.proof, "guest@example.com", NOW + EMAIL_PROOF_TTL_MS + 1)).toBe(false);
    const fake = Buffer.from(JSON.stringify({ k: "email-ok", e: "guest@example.com", exp: NOW * 2 })).toString("base64url") + ".x";
    expect(emailProofValid(fake, "guest@example.com", NOW)).toBe(false);
    // A challenge is not a proof.
    expect(emailProofValid(challenge, "guest@example.com", NOW)).toBe(false);
    expect(emailProofValid(undefined, "guest@example.com", NOW)).toBe(false);
  });
});
