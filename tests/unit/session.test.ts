/* Idle logout (QA audit W-4, Alpha Security #7).
 *
 * A session dies 30 minutes after the admin last DID something, separately
 * from the 8-hour absolute cap. The clock is advanced only by real activity
 * (POST /api/auth/touch) — never by the dashboard's background polling, or
 * an abandoned tab would keep itself signed in all night.
 *
 * `verifySessionToken` and `touchSessionToken` take an injectable clock so
 * these rules can be tested without waiting half an hour.
 */

import {
  createSessionToken,
  verifySessionToken,
  touchSessionToken,
  IDLE_TTL_MS,
} from "@/lib/auth";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe("admin session", () => {
  it("idles out after 30 minutes", () => {
    expect(IDLE_TTL_MS).toBe(30 * MIN);
  });

  it("is valid straight after signing in", () => {
    const now = Date.now();
    expect(verifySessionToken(createSessionToken("admin"), now)?.u).toBe("admin");
  });

  it("survives 29 minutes of inactivity and dies at 31", () => {
    const now = Date.now();
    const token = createSessionToken("admin");

    expect(verifySessionToken(token, now + 29 * MIN)?.u).toBe("admin");
    expect(verifySessionToken(token, now + 31 * MIN)).toBeNull();
  });

  it("expires at 8 hours however active the admin is", () => {
    const now = Date.now();
    let token = createSessionToken("admin");

    // Touched every 20 minutes for nine hours.
    for (let t = 20 * MIN; t < 9 * HOUR; t += 20 * MIN) {
      const live = verifySessionToken(token, now + t);
      if (!live) break;
      token = touchSessionToken(live, now + t);
    }
    expect(verifySessionToken(token, now + 9 * HOUR)).toBeNull();
  });

  it("restarts the idle clock on activity", () => {
    const now = Date.now();
    const session = verifySessionToken(createSessionToken("admin"), now)!;

    // The admin clicks something 20 minutes in.
    const touched = touchSessionToken(session, now + 20 * MIN);

    // 45 minutes after sign-in is only 25 minutes after that click.
    expect(verifySessionToken(touched, now + 45 * MIN)?.u).toBe("admin");
    // 51 minutes after sign-in is 31 after the click, so it is gone.
    expect(verifySessionToken(touched, now + 51 * MIN)).toBeNull();
  });

  it("keeps the absolute expiry when activity renews it", () => {
    const now = Date.now();
    const session = verifySessionToken(createSessionToken("admin"), now)!;
    const touched = verifySessionToken(touchSessionToken(session, now + 10 * MIN), now + 10 * MIN)!;

    expect(touched.exp).toBe(session.exp);
    expect(touched.u).toBe(session.u);
  });

  it("is not kept alive by background polling", () => {
    const now = Date.now();
    const token = createSessionToken("admin");

    // The dashboard polls for half an hour. Verifying is a pure read, so
    // none of it touches the idle stamp.
    for (let t = 0; t < 30 * MIN; t += 30 * 1000) verifySessionToken(token, now + t);

    expect(verifySessionToken(token, now)!.s).toBe(verifySessionToken(token, now)!.s);
    expect(verifySessionToken(token, now + 31 * MIN)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const now = Date.now();
    const [encoded, signature] = createSessionToken("admin").split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));

    // Push the idle stamp forward to try to stay signed in.
    const forged = Buffer.from(JSON.stringify({ ...payload, s: Date.now() + HOUR })).toString("base64url");

    expect(verifySessionToken(`${forged}.${signature}`, now)).toBeNull();
  });

  it("rejects nonsense", () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
  });
});
