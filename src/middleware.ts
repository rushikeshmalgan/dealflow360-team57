import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Authentication routes where already-logged-in users should be redirected to the dashboard.
 */
const isAuthRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
]);

/**
 * Public routes that do NOT require authentication.
 *
 * - /sign-in, /sign-up: Clerk authentication pages (for unauthenticated visitors)
 * - /login: Fallback login route
 * - /api/health: Infrastructure health check (TAD §50)
 * - /api/webhooks/(.*): Webhook endpoints (Clerk user sync, etc.)
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
  "/api/health",
  "/api/webhooks/(.*)",
]);

/**
 * Clerk middleware for Next.js 15.
 *
 * Establishes Clerk auth context on every request. Protected routes
 * require an active Clerk session.
 */
export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // If already signed in, prevent visiting login/sign-in (e.g. browser back button)
  if (userId && isAuthRoute(request)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
