/**
 * Shared database types for use across the application.
 */

import { type PgTransaction } from "drizzle-orm/pg-core";
import { type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { db } from "./drizzle";

/**
 * Type alias for Drizzle database or transaction.
 * Uses a generic type that's compatible with both the main db instance and transaction objects.
 * The 'any' types here are intentional to allow flexibility while still maintaining the core interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbOrTransaction = PgTransaction<PostgresJsQueryResultHKT, any, any> | typeof db;
