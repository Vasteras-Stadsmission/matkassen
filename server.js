/**
 * Custom Next.js Server with SMS Scheduler
 *
 * This custom server starts the SMS background scheduler when the application starts,
 * ensuring SMS processing begins immediately without relying on API calls.
 */

const { createServer } = require("http");
const next = require("next");
const { startSmsScheduler } = require("./app/utils/sms/scheduler");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// Prepare Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    // Start SMS scheduler for background processing (production only)
    if (!dev) {
        // Small delay to ensure app is fully ready before starting background services
        setTimeout(() => {
            try {
                console.log("🚀 Starting SMS background scheduler...");
                startSmsScheduler();
                console.log("✅ SMS scheduler started successfully via custom server");
            } catch (error) {
                console.error("❌ Failed to start SMS scheduler:", error);
            }
        }, 1000); // 1 second delay
    }

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
