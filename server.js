/**
 * Custom Next.js Server with Unified Background Scheduler
 *
 * This custom server starts the unified background scheduler when the application starts,
 * handling both SMS processing and household anonymization.
 *
 * NOTE: This file uses CommonJS (require) instead of ES modules for compatibility:
 * - Next.js custom servers officially use CommonJS
 * - Simplifies synchronous module loading during startup
 * - Avoids ESM/CJS interop issues with Next.js internals
 * - Infrastructure code (deployment concern), not application code
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

    // CommonJS require is intentional here - matches server.js module system
    const { checkDatabaseHealth } = require("./app/db/health-check");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Use the dedicated health check function
            await checkDatabaseHealth();
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
