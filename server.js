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

app.prepare().then(() => {
    // Start unified scheduler for background processing
    // Small delay to ensure app is fully ready before starting background services
    setTimeout(() => {
        try {
            console.log("🚀 Starting unified background scheduler...");
            startScheduler();
            console.log("✅ Scheduler started successfully");
        } catch (error) {
            console.error("❌ Failed to start scheduler:", error);
        }
    }, 1000); // 1 second delay

    // Create HTTP server
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
});
