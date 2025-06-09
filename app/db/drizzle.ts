import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

// Check if we're running in a test environment or during build
const isTestEnvironment = process.env.NODE_ENV === "test";
// Better build detection: check if we're in build phase or if DATABASE_URL is missing
const isBuildTime =
    process.env.NEXT_PHASE === "phase-production-build" ||
    (typeof window === "undefined" &&
        !process.env.DATABASE_URL &&
        (process.env.NODE_ENV === "production" || !process.env.NODE_ENV));

// Only require DATABASE_URL in non-test environments and not during build
if (!process.env.DATABASE_URL && !isTestEnvironment && !isBuildTime) {
    throw new Error("DATABASE_URL environment variable is not set");
}

// Use a mock or real client based on environment
export const client =
    isTestEnvironment || isBuildTime
        ? ({} as ReturnType<typeof postgres>) // Mock client for tests and build
        : postgres(process.env.DATABASE_URL as string);

export const db =
    isTestEnvironment || isBuildTime
        ? ({} as ReturnType<typeof drizzle>) // Mock DB for tests and build
        : drizzle(client);
