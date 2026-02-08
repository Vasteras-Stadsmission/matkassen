/**
 * Session cookie name — shared across auth.ts, middleware.ts, and test helpers.
 * Bump the version suffix to invalidate all existing sessions on deploy.
 */
export const SESSION_COOKIE_NAME = "next-auth.session-token.v4";

/** The __Secure- prefixed variant used in production (HTTPS). */
export const SESSION_COOKIE_NAME_SECURE = `__Secure-${SESSION_COOKIE_NAME}`;
