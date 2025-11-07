import type { Logger as PinoLogger } from "pino";

/**
 * Application logger instance
 */
export const logger: PinoLogger;

/**
 * Create a child logger with additional context
 *
 * @example
 * const log = createLogger({ userId: '123', action: 'enrollment' })
 * log.info('User enrolled successfully')
 */
export function createLogger(context: Record<string, unknown>): PinoLogger;

/**
 * Log an error with full context
 *
 * @example
 * logError('Failed to process SMS', error, { parcelId: '123', userId: 'abc' })
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void;

/**
 * Log a critical error that requires immediate attention
 * Use this sparingly for issues that need investigation
 */
export function logCritical(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
): void;

/**
 * Log health check or system status
 */
export function logHealth(status: "healthy" | "unhealthy", details?: Record<string, unknown>): void;

/**
 * Log a scheduled job execution
 */
export function logCron(
    jobName: string,
    status: "started" | "completed" | "failed",
    details?: Record<string, unknown>,
): void;

/**
 * Logger type re-export for convenience
 */
export type Logger = PinoLogger;
