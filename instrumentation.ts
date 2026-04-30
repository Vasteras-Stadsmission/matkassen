// Next.js 15 runs `register()` once during server startup, before any
// request is handled. This is the supported hook for startup-time work
// under `output: "standalone"` — the repo-root `server.js` is shadowed
// by the Next-generated standalone server at runtime, so validation
// placed there never executes in prod.
//
// We use it to validate DATABASE_SSL authoritatively: a typo like
// `DATABASE_SSL=required` (missing the `e`) would otherwise surface
// only on the first DB-backed request, potentially hours after deploy
// and well after the health check has already reported success.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseDatabaseSslMode } = require("./app/db/database-ssl.cjs") as {
    parseDatabaseSslMode: () => unknown;
};

export function register() {
    parseDatabaseSslMode();
}
