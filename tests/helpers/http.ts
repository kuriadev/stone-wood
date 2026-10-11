import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

let n = 0;
/** Builds a NextRequest. Each call gets its own client IP so the in-memory rate limiter never couples tests. */
export function req(method: string, url: string, body?: unknown, opts: { admin?: boolean; ip?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? `10.0.${Math.floor(++n / 250)}.${n % 250}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie = opts.cookie ?? (opts.admin ? `${SESSION_COOKIE}=${createSessionToken("admin")}` : undefined);
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://localhost:3000${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
export const json = async (res: Response) => (await res.json()) as any;
