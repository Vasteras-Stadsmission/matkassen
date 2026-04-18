/**
 * Source of truth for DATABASE_SSL parsing.
 *
 * Consumed by:
 *   - app/db/drizzle.ts                    (postgres-js, option form)
 *   - app/db/health-check.js               (postgres-js, option form)
 *   - drizzle.config.ts                    (pg via drizzle-kit, URL form)
 *   - scripts/backfill-user-profiles.mjs   (pg direct, URL form)
 *
 * Written as CommonJS so all three module systems in the repo (TS ESM, plain
 * CJS, .mjs ESM scripts) can consume it without a build step.
 *
 * Accepted values (case-insensitive):
 *   "require" | "verify-full" | "disable" | unset
 *
 * Any other non-empty value throws — a silent fallback on a typo like
 * "required" would downgrade to plaintext, defeating the point of the knob.
 *
 * Precedence: when DATABASE_SSL is set (to any recognized value, including
 * "disable"), it authoritatively overrides any conflicting `sslmode=...`
 * already present in DATABASE_URL. Unset means "defer to DATABASE_URL".
 */

"use strict";

/**
 * @returns {"require" | "verify-full" | "disable" | null} null = unset
 */
function parseDatabaseSslMode() {
    const raw = process.env.DATABASE_SSL;
    if (raw === undefined || raw === "") return null;
    const mode = raw.toLowerCase();
    if (mode === "disable" || mode === "require" || mode === "verify-full") {
        return mode;
    }
    throw new Error(
        `Unsupported DATABASE_SSL value: ${JSON.stringify(raw)}. ` +
            'Expected one of: "require", "verify-full", "disable", or unset.',
    );
}

/**
 * SSL option for postgres-js `postgres(url, { ssl })`.
 *
 *   unset         -> undefined (caller omits the option, URL's sslmode wins)
 *   "disable"     -> false     (authoritatively off; beats URL sslmode)
 *   "require"     -> "require"     (encrypt, don't verify CA)
 *   "verify-full" -> "verify-full" (encrypt + verify CA + hostname)
 *
 * postgres-js's options beat URL query params (verified in
 * node_modules/postgres/src/index.js line 473), so returning `false` here
 * reliably disables TLS even if DATABASE_URL says otherwise.
 */
function postgresJsSslOption() {
    const mode = parseDatabaseSslMode();
    if (mode === null) return undefined;
    if (mode === "disable") return false;
    return mode;
}

/**
 * Rewrite a postgres URL's `sslmode` query parameter to reflect DATABASE_SSL.
 * Used for pg (node-postgres) and drizzle-kit, where URL params win over the
 * options object (pg reparses connectionString after options merge — see
 * pg's connection-parameters.js line 55). To make DATABASE_SSL authoritative
 * for pg clients, the knob must be encoded in the URL itself.
 *
 * Mapping to libpq-style sslmode (as honored by pg-connection-string):
 *   "require"     -> sslmode=no-verify    ({ rejectUnauthorized: false })
 *   "verify-full" -> sslmode=verify-full  ({} → Node tls defaults = verified)
 *   "disable"     -> sslmode=disable      (ssl: false)
 *   unset         -> URL unchanged
 */
function applyDatabaseSslToUrl(databaseUrl) {
    const mode = parseDatabaseSslMode();
    if (mode === null) return databaseUrl;
    const sslmode =
        mode === "require"
            ? "no-verify"
            : mode === "verify-full"
              ? "verify-full"
              : "disable";
    const url = new URL(databaseUrl);
    url.searchParams.set("sslmode", sslmode);
    return url.toString();
}

module.exports = {
    parseDatabaseSslMode,
    postgresJsSslOption,
    applyDatabaseSslToUrl,
};
