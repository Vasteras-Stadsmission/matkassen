import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

// Niklas: To access the DB when running locally (outside of the container), you
// need to set the DATABASE_URL_EXTERNAL environment variable instead of DATABASE_URL.
if (!process.env.DATABASE_URL_EXTERNAL) {
    throw new Error("DATABASE_URL_EXTERNAL environment variable is not set");
}

export const client = postgres(process.env.DATABASE_URL_EXTERNAL);
export const db = drizzle(client);
