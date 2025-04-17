import type { Config } from "drizzle-kit";

export default {
    schema: "./app/db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    out: "./migrations",
    verbose: true,
    strict: true,
} satisfies Config;
