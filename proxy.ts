import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth";

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

function hasCredential(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();

  // Bootstrap gate: until the admin is set up, everything routes to /setup.
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

  // Bootstrapped + public route → pass.
  if (isPublic(pathname)) return NextResponse.next();

  // Bootstrapped + protected route → require a credential (cookie or bearer).
  // Full session validation happens in the route handler; this is just
  // Next's recommended "optimistic check" pattern.
  if (hasCredential(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
