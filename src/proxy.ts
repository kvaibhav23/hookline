import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

// Optional access gate. A public deployment with live keys lets anyone spend your LLM and search
// credits and read every prospect you've researched. Set APP_PASSWORD to require a password
// (HTTP Basic auth; any username). Unset = open, which is fine for local dev and mock demos.

function matches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (matches(given, password)) return NextResponse.next();
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Hookline", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
