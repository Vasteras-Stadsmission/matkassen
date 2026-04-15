import type { Config } from "drizzle-kit";

// drizzle-kit's `dbCredentials.ssl` field is IGNORED when `url` is set (it goes
// through pg.Pool's connectionString path, which only reads SSL from URL query
// params). So we encode DATABASE_SSL into the URL via `sslmode=...`:
//   - "require" / "true" → sslmode=no-verify (encrypt, don't verify CA) — matches
//     postgres-js's `ssl: "require"` semantics used in app/db/drizzle.ts
//   - "verify-full"      → sslmode=verify-full (encrypt + verify CA + hostname)
//   - unset / "disable"  → URL left as-is
const databaseUrl = ((): string => {
    const base = process.env.DATABASE_URL!;
    const raw = process.env.DATABASE_SSL;
    const mode = (raw ?? "").toLowerCase();
    if (!mode || mode === "disable" || mode === "false") return base;
    let sslmode: string;
    if (mode === "require" || mode === "true") sslmode = "no-verify";
    else if (mode === "verify-full") sslmode = "verify-full";
    else
        throw new Error(
            `Unsupported DATABASE_SSL value: ${JSON.stringify(raw)}. ` +
                `Expected one of: "require", "verify-full", "disable", or unset.`,
        );
    const url = new URL(base);
    url.searchParams.set("sslmode", sslmode);
    return url.toString();
})();

export default {
    schema: "./app/db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: databaseUrl,
    },
    out: "./migrations",
    verbose: true,
    strict: true,
} satisfies Config;
