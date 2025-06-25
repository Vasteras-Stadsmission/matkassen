import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { config } from "dotenv";

config();

// Check if we're running in a test environment
const isTestEnvironment = process.env.NODE_ENV === "test";

// More robust build detection using Next.js official constants
// Note: NEXT_PHASE is only set during Next.js build, so we fallback to NODE_ENV check
const isBuildTime =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ||
    (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL);

// Create proper mock implementations that throw on actual use
const createMockClient = () => {
    // Create a more complete mock that matches the postgres client signature
    const mockFn = (() => {
        throw new Error("Database client called during build time or tests");
    }) as unknown as ReturnType<typeof postgres>;

    return new Proxy(mockFn, {
        apply() {
            throw new Error("Database client called during build time or tests");
        },
        get(target, prop) {
            throw new Error(
                `Database client property accessed during build time or tests. Property: ${String(prop)}`,
            );
        },
    });
};

const createMockDb = () => {
    return new Proxy({} as ReturnType<typeof drizzle>, {
        get(target, prop) {
            if (prop === "select") {
                // Return a mock select function that handles chained calls properly
                return () => ({
                    from: () => Promise.resolve([]), // Direct select().from() calls
                    where: () => ({
                        orderBy: () => Promise.resolve([]),
                        limit: () => Promise.resolve([]),
                    }),
                    orderBy: () => Promise.resolve([]),
                    limit: () => Promise.resolve([]),
                });
            }

            // For other database operations, still throw to catch unexpected usage
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
