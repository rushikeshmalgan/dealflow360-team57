/**
 * Just the cookie name constant, deliberately dependency-free (no Prisma import). Next's edge
 * `middleware.ts` runs in the Edge runtime, which can't load `pg`/Prisma — importing this instead
 * of pulling it in via session.ts (which does import the database client) keeps middleware.ts
 * edge-compatible while every server-side/Node caller still shares the same constant.
 */
export const SESSION_COOKIE_NAME = "df_session";
