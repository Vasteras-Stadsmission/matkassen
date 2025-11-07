/**
 * Rate limiting utilities for SMS API endpoints
 * Prevents accidental floods and abuse of SMS services
 */

import { logger } from "@/app/utils/logger";

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory rate limit store (consider Redis for production scaling)
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    error?: string;
}

/**
 * Check and update rate limit for a given key
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();

    // Clean up expired entries
    const expiredKeys: string[] = [];
    for (const [k, entry] of rateLimitStore.entries()) {
        if (entry.resetTime <= now) {
            rateLimitStore.delete(k);
            expiredKeys.push(k);
        }
    }

    // Log rate limit recovery
    if (expiredKeys.length > 0) {
        logger.debug({ keys: expiredKeys, count: expiredKeys.length }, "Rate limits reset");
    }

    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime <= now) {
        // New or expired entry
        const newEntry: RateLimitEntry = {
            count: 1,
            resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, newEntry);

        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetTime: newEntry.resetTime,
        };
    }

    if (entry.count >= config.maxRequests) {
        // Rate limit exceeded
        return {
            allowed: false,
            remaining: 0,
            resetTime: entry.resetTime,
            error: `Rate limit exceeded. Try again after ${new Date(entry.resetTime).toISOString()}`,
        };
    }

    // Increment count
    entry.count += 1;
    rateLimitStore.set(key, entry);

    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetTime: entry.resetTime,
    };
}

/**
 * Rate limiting configurations for different SMS endpoints
 */
export const SMS_RATE_LIMITS = {
    // Individual parcel SMS: 10 requests per 5 minutes per user
    PARCEL_SMS: { maxRequests: 10, windowMs: 5 * 60 * 1000 },

    // Queue processing: 3 requests per minute per user (manual triggers)
    QUEUE_PROCESSING: { maxRequests: 3, windowMs: 60 * 1000 },
} as const;

/**
 * Generate rate limit key for SMS endpoints
 */
export function getSmsRateLimitKey(endpoint: string, userId: string, identifier?: string): string {
    const parts = ["sms", endpoint, userId];
    if (identifier) {
        parts.push(identifier);
    }
    return parts.join(":");
}
