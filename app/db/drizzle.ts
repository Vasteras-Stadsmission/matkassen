import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { config } from "dotenv";
import { logger } from "@/app/utils/logger";

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
    /**
     * Simple mock database that returns empty arrays for all operations.
     * This mock supports method chaining by returning a promise that resolves to an empty array.
     * The chainable pattern is necessary because Drizzle ORM uses method chaining extensively
     * (e.g., db.select().from().where().orderBy()), and each method in the chain needs to be awaitable.
     */
    const emptyArrayPromise = Promise.resolve<Record<string, unknown>[]>([]);

    // Create a chainable mock that supports all common Drizzle methods
    const createChainableMock = () => {
        const mock = {
            // Query builder methods - all return the same mock for chaining
            from: () => mock,
            innerJoin: () => mock,
            leftJoin: () => mock,
            rightJoin: () => mock,
            fullJoin: () => mock,
            where: () => mock,
            orderBy: () => mock,
            limit: () => mock,
            offset: () => mock,
            // Promise methods - delegate to the empty array promise
            then: emptyArrayPromise.then.bind(emptyArrayPromise),
            catch: emptyArrayPromise.catch.bind(emptyArrayPromise),
            finally: emptyArrayPromise.finally.bind(emptyArrayPromise),
        };
        return mock;
    };

    return new Proxy({} as ReturnType<typeof drizzle>, {
        get(_target, prop) {
            if (prop === "select") {
                return () => createChainableMock();
            }

            // For other database operations, still throw to catch unexpected usage in tests
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
        logger.info("Using mock database for tests");
    } else if (isBuildTime) {
        // Build time - warn but allow to continue
        logger.info("DATABASE_URL not available during build (expected)");
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
