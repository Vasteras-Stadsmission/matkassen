import { drizzle } from "drizzle-orm/postgres-js";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Use require for postgres to avoid import issues
const postgres = require("postgres");

// Use require for dotenv to avoid import issues
require("dotenv").config();

// Check if we're running in a test environment
const isTestEnvironment = process.env.NODE_ENV === "test";

// More robust build detection using Next.js official constants
// Note: NEXT_PHASE is only set during Next.js build, so we fallback to NODE_ENV check
const isBuildTime =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ||
    (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL);

// Create proper mock implementations that throw on actual use
const createMockClient = () => {
    // Proxy a function since postgres client is callable
    return new Proxy(() => {}, {
        apply() {
            throw new Error("Database client called during build time or tests");
        },
        get(target, prop) {
            throw new Error(
                `Database client property accessed during build time or tests. Property: ${String(prop)}`,
            );
        },
    }) as ReturnType<typeof postgres>;
};

const createMockDb = () => {
    return new Proxy({} as ReturnType<typeof drizzle>, {
        get(target, prop) {
            throw new Error(
                `Database accessed during build time or tests. Property: ${String(prop)}`,
            );
        },
    });
};

// Handle different scenarios with clear error messages
if (!process.env.DATABASE_URL) {
    if (isTestEnvironment) {
        // Tests can continue with mocks
        console.log("Using mock database for tests");
    } else if (isBuildTime) {
        // Build time - warn but allow to continue
        console.log("DATABASE_URL not available during build (expected)");
    } else {
        // Runtime without DATABASE_URL - this is an error
        throw new Error(
            "DATABASE_URL environment variable is not set. " +
                "This is required at runtime for database connectivity.",
        );
    }
}

// Export appropriate client and db based on environment
export const client =
    isTestEnvironment || isBuildTime
        ? createMockClient()
        : postgres(process.env.DATABASE_URL as string);

export const db = isTestEnvironment || isBuildTime ? createMockDb() : drizzle(client);
