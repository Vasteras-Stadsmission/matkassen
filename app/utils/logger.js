const pino = require("pino");

/**
 * Application logger configuration
 *
 * Development: Pretty-printed, colorized output for easy debugging
 * Production: Structured JSON logs for docker logs and parsing
 */

const isDevelopment = process.env.NODE_ENV === "development";
const isServer = typeof window === "undefined";

// Create base logger
let baseLogger;

if (isServer) {
    // Server-side logging
    const loggerConfig = {
        level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
        base: undefined,
        formatters: {
            level: label => {
                return { level: label.toUpperCase() };
            },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (isDevelopment) {
        // Development: use pino-pretty via transport with sync mode
        // Use eval to prevent webpack from bundling pino-pretty in client builds
        const prettyModule = "pino-pretty";
        // eslint-disable-next-line no-eval
        const pretty = eval("require")(prettyModule)({
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
            singleLine: false,
            sync: true,
        });
        baseLogger = pino(loggerConfig, pretty);
    } else {
        // Production: JSON logs
        baseLogger = pino(loggerConfig);
    }
} else {
    // Client-side: use pino browser build (minimal, no fs dependencies)
    baseLogger = pino({
        level: "warn",
        browser: {
            asObject: true,
        },
    });
}

// Export the base logger
const logger = baseLogger;

/**
 * Create a child logger with additional context
 *
 * @example
 * const log = createLogger({ userId: '123', action: 'enrollment' })
 * log.info('User enrolled successfully')
 */
function createLogger(context) {
    return logger.child(context);
}

/**
 * Log an error with full context
 *
 * @example
 * logError('Failed to process SMS', error, { parcelId: '123', userId: 'abc' })
 */
function logError(message, error, context) {
    const errorInfo =
        error instanceof Error ? { error: error.message, stack: error.stack } : { error };

    logger.error(
        {
            ...context,
            ...errorInfo,
        },
        message,
    );
}

/**
 * Log a critical error that requires immediate attention
 * Use this sparingly for issues that need investigation
 */
function logCritical(message, error, context) {
    const errorInfo =
        error instanceof Error
            ? { error: error.message, stack: error.stack }
            : error
              ? { error }
              : {};

    logger.fatal(
        {
            ...context,
            ...errorInfo,
        },
        message,
    );
}

/**
 * Log health check or system status
 */
function logHealth(status, details) {
    if (status === "healthy") {
        logger.info({ ...details, health: status }, "Health check");
    } else {
        logger.error({ ...details, health: status }, "Health check failed");
    }
}

/**
 * Log a scheduled job execution
 */
function logCron(jobName, status, details) {
    const level = status === "failed" ? "error" : "info";
    logger[level](
        {
            ...details,
            job: jobName,
            status,
        },
        `Cron job ${status}: ${jobName}`,
    );
}

module.exports = {
    logger,
    createLogger,
    logError,
    logCritical,
    logHealth,
    logCron,
};
