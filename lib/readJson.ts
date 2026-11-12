// The body of an API request, with every text in it cleaned (lib/cleanText):
// no emoji, control or invisible characters, whatever sent it. Every route
// reads its JSON through this instead of `req.json()`. Like `req.json()` it
// rejects when the body is not JSON, so `.catch(() => ({}))` still works.

import { cleanDeep } from "@/lib/cleanText";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same `any` req.json() returns; each route checks its own shape
export async function readJson(req: Request): Promise<any> {
  return cleanDeep(await req.json());
}
