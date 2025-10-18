/**
 * Custom Next.js Server with Unified Background Scheduler
 *
 * This custom server starts the unified background scheduler when the application starts,
 * handling both SMS processing and household anonymization.
 */

const { createServer } = require("http");
const next = require("next");
const { startScheduler } = require("./app/utils/scheduler");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// Prepare Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Wait for database to be ready before starting scheduler
 * This prevents "ENOTFOUND db" errors during container startup
 */
async function waitForDatabase(maxAttempts = 10, delayMs = 2000) {
    console.log("🔍 Checking database connectivity...");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Dynamic import to avoid build-time database access
            const { db } = await import("./app/db/drizzle.ts");
            const { sql } = await import("drizzle-orm");

            // Simple query to test connection
            await db.execute(sql`SELECT 1`);
            console.log(`✅ Database connection successful (attempt ${attempt}/${maxAttempts})`);
            return true;
        } catch (error) {
            console.log(
                `⏳ Database not ready yet (attempt ${attempt}/${maxAttempts}): ${error.message}`,
            );

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.warn(
        `⚠️  Database not reachable after ${maxAttempts} attempts. Scheduler will start anyway but may experience errors.`,
    );
    return false;
}

app.prepare().then(async () => {
    // Create HTTP server first (so health checks can pass)
    createServer(async (req, res) => {
        try {
            await handle(req, res);
        } catch (err) {
            console.error("Error occurred handling", req.url, err);
            res.statusCode = 500;
            res.end("internal server error");
        }
    }).listen(port, () => {
        console.log(`🚀 Server ready on http://${hostname}:${port}`);
    });

    // Start unified scheduler for background processing
    // Wait for database to be ready first to prevent connection errors
    await waitForDatabase();

    try {
        console.log("🚀 Starting unified background scheduler...");
        startScheduler();
        console.log("✅ Scheduler started successfully");
    } catch (error) {
        console.error("❌ Failed to start scheduler:", error);
    }
});
