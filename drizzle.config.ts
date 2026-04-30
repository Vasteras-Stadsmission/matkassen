import type { Config } from "drizzle-kit";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyDatabaseSslToUrl } = require("./app/db/database-ssl.cjs") as {
    applyDatabaseSslToUrl: (url: string) => string;
};

// drizzle-kit's `dbCredentials.ssl` field is IGNORED when `url` is set — it
// hands the URL to pg.Pool as a connectionString and drops ssl. So DATABASE_SSL
// is encoded into the URL itself via applyDatabaseSslToUrl (see
// app/db/database-ssl.cjs for the full sslmode mapping). When DATABASE_SSL is
// set, it overwrites any conflicting sslmode already in the URL.
export default {
    schema: "./app/db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: applyDatabaseSslToUrl(process.env.DATABASE_URL!),
    },
    out: "./migrations",
    verbose: true,
    strict: true,
} satisfies Config;
