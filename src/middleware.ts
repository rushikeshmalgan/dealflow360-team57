import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes that do NOT require authentication.
 *
 * - /sign-in, /sign-up: Clerk authentication pages
 * - /api/health: Infrastructure health check (TAD §50)
 * - /api/webhooks/(.*): Webhook endpoints (Clerk user sync, etc.)
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
  "/products(.*)",
  "/api/health",
  "/api/webhooks/(.*)",
  "/api/products(.*)",
  "/api/categories(.*)",
]);

/**
 * Clerk middleware for Next.js 15.
 *
 * Establishes Clerk auth context on every request. Protected routes
 * (anything not in isPublicRoute) require an active Clerk session.
 *
 * Note: This middleware establishes identity. Authorization (role checks,
 * resource ownership) is enforced at each protected resource per TAD §7,
 * not solely by path matching here.
 */
export default clerkMiddleware(async (auth, request) => {
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
