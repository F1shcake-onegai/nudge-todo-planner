import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { SESSION_COOKIE, clearSessionCookie, validateSession } from "@/lib/auth";

// Paths that never require auth. Keep additions narrow.
const PUBLIC_PREFIXES = [
  "/login",
  "/setup",
  "/api/auth/",
  "/api/setup/",
  "/api/cron/",
  "/api/calendar/feed/", // token-gated by the route itself
];

const PUBLIC_EXACT = new Set(["/manifest.webmanifest", "/sw.js", "/favicon.ico"]);

function isStatic(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    /\.(png|svg|ico|jpg|jpeg|webp|gif|woff2?|ttf|css|js\.map)$/.test(pathname)
  );
}

function isPublic(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function tokenFromRequest(req: NextRequest): string | null {
  const cookieVal = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieVal) return cookieVal;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();

  // Bootstrap gate.
  const settings = await db.query.settings.findFirst();
  const bootstrapped = settings?.bootstrapped === true;

  if (!bootstrapped) {
    if (
      pathname.startsWith("/setup") ||
      pathname.startsWith("/api/setup/") ||
      PUBLIC_EXACT.has(pathname)
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  // Once bootstrapped, /setup and /api/setup/* are no longer public.
  if (pathname.startsWith("/setup") || pathname.startsWith("/api/setup/")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Public-after-bootstrap routes pass through.
  if (isPublic(pathname)) return NextResponse.next();

  // Validate the session against the DB (not just "does the cookie exist").
  const token = tokenFromRequest(req);
  const session = token ? await validateSession(token) : null;

  if (session) return NextResponse.next();

  // Invalid or missing → redirect pages, 401 APIs, and proactively clear the
  // stale cookie if one was present so the browser stops sending it.
  if (pathname.startsWith("/api/")) {
    const res = new NextResponse("Unauthorized", { status: 401 });
    if (token && req.cookies.get(SESSION_COOKIE)?.value) {
      res.headers.append("Set-Cookie", clearSessionCookie());
    }
    return res;
  }

  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  const res = NextResponse.redirect(login);
  if (token && req.cookies.get(SESSION_COOKIE)?.value) {
    res.headers.append("Set-Cookie", clearSessionCookie());
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
