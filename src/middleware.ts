import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

/**
 * Authentication routes where an already-logged-in visitor should be redirected to their
 * landing page instead of seeing the login form again (e.g. browser back button).
 */
const AUTH_ROUTES = ["/login"];

/**
 * Public routes that do NOT require a session cookie at the edge.
 *
 * - /login: email/password entry point (internal roles land on "/", CUSTOMER lands on "/portal")
 * - /api/(.*): every Route Handler enforces identity & role-based access control itself via
 *   getRequestActor() and returns a JSON 401/403 instead of a browser redirect. In development
 *   this also allows the x-dev-user-id bypass for Postman/tests.
 */
const PUBLIC_PREFIXES = ["/login", "/api/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Lightweight edge check: presence of the `df_session` cookie gates page routes (the cookie's
 * validity — expiry, revocation — is re-checked server-side by getCurrentUser()/getRequestActor()
 * on every actual render/request, since middleware can't hit the database).
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (hasSession && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!hasSession && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
