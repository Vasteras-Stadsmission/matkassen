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

const path = require("path");
const fs = require("fs");
const Module = require("module");
const { createServer } = require("http");
const next = require("next");

const SERVER_BUILD_DIR = path.join(__dirname, "server-build");

function ensureServerBuildFile(relativePath) {
    const filePath = path.join(SERVER_BUILD_DIR, relativePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Missing compiled file "${filePath}". Run "pnpm run build:scheduler" before starting the server.`,
        );
    }
}

let aliasRegistered = false;
function registerAppAliasResolver() {
    if (aliasRegistered) {
        return;
    }

    const originalResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...rest) {
        if (request.startsWith("@/")) {
            request = path.join(SERVER_BUILD_DIR, request.slice(2));
        }

        return originalResolveFilename.call(this, request, parent, ...rest);
    };

    aliasRegistered = true;
}

function loadCompiledModule(request) {
    registerAppAliasResolver();
    return require(request);
}

// Logger is plain JS, require directly
const { logger, logError } = require("./app/utils/logger");

// Scheduler is compiled TypeScript, load from server-build
ensureServerBuildFile("app/utils/scheduler.js");
const { startScheduler } = loadCompiledModule("@/app/utils/scheduler");

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
    logger.info("Checking database connectivity");

    // CommonJS require is intentional here - matches server.js module system
    const { checkDatabaseHealth } = require("./app/db/health-check");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await checkDatabaseHealth();
            logger.info({ attempt, maxAttempts }, "Database connection successful");
            return true;
        } catch (error) {
            logger.warn({ attempt, maxAttempts, error: error.message }, "Database not ready yet");

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    logger.warn(
        { maxAttempts },
        "Database not reachable after max attempts. Scheduler will start anyway but may experience errors",
    );
    return false;
}

app.prepare().then(async () => {
    createServer(async (req, res) => {
        try {
            await handle(req, res);
        } catch (err) {
            logError("Error occurred handling request", err, { url: req.url });
            res.statusCode = 500;
            res.end("internal server error");
        }
    }).listen(port, () => {
        logger.info({ hostname, port }, "Server ready");
    });

    await waitForDatabase();

    try {
        logger.info("Starting unified background scheduler");
        startScheduler();
        logger.info("Scheduler started successfully");
    } catch (error) {
        logError("Failed to start scheduler", error);
    }
});
