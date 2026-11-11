/* Five wrong tries pause sign-in for a minute; a correct one starts fresh. */

import { LOGIN_TRIES, LOGIN_PAUSE_SECONDS, lockedFor, recordFailure, clearFailures } from "@/lib/loginLock.server";

it("counts tries down, then pauses, then opens again", () => {
  const t0 = 1_000_000;
  for (let i = 1; i < LOGIN_TRIES; i++) expect(recordFailure("a", t0)).toEqual({ triesLeft: LOGIN_TRIES - i, lockedFor: 0 });
  expect(recordFailure("a", t0)).toEqual({ triesLeft: 0, lockedFor: LOGIN_PAUSE_SECONDS });
  expect(lockedFor("a", t0 + 1000)).toBe(LOGIN_PAUSE_SECONDS - 1);
  expect(lockedFor("a", t0 + LOGIN_PAUSE_SECONDS * 1000)).toBe(0);
  // After the pause: a full set of tries again.
  expect(recordFailure("a", t0 + LOGIN_PAUSE_SECONDS * 1000 + 1).triesLeft).toBe(LOGIN_TRIES - 1);
});

it("a correct sign-in clears the count, per address", () => {
  recordFailure("b"); recordFailure("b");
  clearFailures("b");
  expect(recordFailure("b").triesLeft).toBe(LOGIN_TRIES - 1);
  expect(recordFailure("c").triesLeft).toBe(LOGIN_TRIES - 1);
});
