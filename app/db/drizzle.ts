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
    // Build a chainable, thenable query builder that always resolves to an empty array.
    type EmptyRow = Record<string, unknown>;

    interface MockSelectBuilder extends PromiseLike<EmptyRow[]> {
        from: (...args: unknown[]) => MockSelectBuilder;
        innerJoin: (...args: unknown[]) => MockSelectBuilder;
        leftJoin: (...args: unknown[]) => MockSelectBuilder;
        rightJoin: (...args: unknown[]) => MockSelectBuilder;
        fullJoin: (...args: unknown[]) => MockSelectBuilder;
        where: (...args: unknown[]) => MockSelectBuilder;
        orderBy: (...args: unknown[]) => MockSelectBuilder;
        limit: (...args: unknown[]) => MockSelectBuilder;
        offset: (...args: unknown[]) => MockSelectBuilder;
        catch: (onRejected: (reason: unknown) => unknown) => Promise<EmptyRow[]>;
        finally: (onFinally: () => void) => Promise<EmptyRow[]>;
    }

    const makeSelectBuilder = (): MockSelectBuilder => {
        // We purposefully ignore all arguments and always return the same builder
        // so callers can chain methods like from().innerJoin().where().orderBy().limit()
        // and finally await the result to get an empty array.
        const resolved = Promise.resolve<EmptyRow[]>([]);

        const builder: MockSelectBuilder = {
            from: () => builder,
            innerJoin: () => builder,
            leftJoin: () => builder,
            rightJoin: () => builder,
            fullJoin: () => builder,
            where: () => builder,
            orderBy: () => builder,
            limit: () => builder,
            offset: () => builder,
            // Make the builder thenable so `await db.select(...).from(...).where(...)` works.
            then: (onFulfilled, onRejected) => resolved.then(onFulfilled, onRejected),
            catch: onRejected => resolved.catch(onRejected) as Promise<EmptyRow[]>,
            finally: onFinally => resolved.finally(onFinally) as Promise<EmptyRow[]>,
        };
        return builder;
    };

    return new Proxy({} as ReturnType<typeof drizzle>, {
        get(_target, prop) {
            if (prop === "select") {
                // Return a mock select function that handles chained calls properly
                return () => makeSelectBuilder();
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
