const pino = require("pino");

/**
 * Application logger configuration
 *
 * Development: Pretty-printed, colorized output for easy debugging
 * Production: Structured JSON logs for docker logs and parsing
 */

const isDevelopment = process.env.NODE_ENV === "development";

// Create base logger
const baseLogger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
    // Exclude pid and hostname from all logs (not useful in Docker)
    base: undefined,
    formatters: {
        level: label => {
            return { level: label.toUpperCase() };
        },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // In development, use pretty printing
    ...(isDevelopment
        ? {
              transport: {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "HH:MM:ss",
                      ignore: "pid,hostname",
                      singleLine: false,
                  },
              },
          }
        : {}),
});

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
