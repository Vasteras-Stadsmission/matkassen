/**
 * Database Health Check Module
 *
 * CommonJS module for server.js to verify database connectivity before starting the scheduler.
 * This avoids ESM/TypeScript import issues in the custom server.
 */

const postgres = require("postgres");

/**
 * Test database connectivity with a simple query
 * @returns {Promise<boolean>} True if database is reachable
 */
async function checkDatabaseHealth() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error("DATABASE_URL environment variable is not set");
    }

    // Create a temporary connection just for the health check
    const sql = postgres(databaseUrl, {
        max: 1, // Only need one connection for health check
        idle_timeout: 5,
        connect_timeout: 10,
    });

    try {
        // Simple query to test connectivity
        await sql`SELECT 1 as health_check`;
        return true;
    } finally {
        // Always close the connection
        await sql.end();
    }
}

module.exports = { checkDatabaseHealth };
