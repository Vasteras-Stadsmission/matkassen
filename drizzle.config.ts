import type { Config } from "drizzle-kit";

export default {
    schema: process.env.DRIZZLE_SCHEMA_PATH!,
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
} satisfies Config;
