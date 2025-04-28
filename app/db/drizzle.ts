import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

// Check if we're running in a test environment
const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test";

// Only require DATABASE_URL in non-test environments
if (!process.env.DATABASE_URL && !isTestEnvironment) {
    throw new Error("DATABASE_URL environment variable is not set");
}

// Use a mock or real client based on environment
export const client = isTestEnvironment
    ? ({} as ReturnType<typeof postgres>) // Mock client for tests
    : postgres(process.env.DATABASE_URL as string);

export const db = isTestEnvironment
    ? ({} as ReturnType<typeof drizzle>) // Mock DB for tests
    : drizzle(client);
