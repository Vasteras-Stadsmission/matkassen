/**
 * TimeProvider - Centralized time management for the application
 *
 * This provider ensures all time operations use Stockholm timezone consistently
 * and provides a mockable interface for testing.
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { startOfDay, endOfDay, getISOWeek, startOfWeek, endOfWeek } from "date-fns";

const STOCKHOLM_TIMEZONE = "Europe/Stockholm";

// Weekday mapping that matches our database enum
export const WEEKDAY_MAPPING = [
    "sunday", // JS: 0
    "monday", // JS: 1
    "tuesday", // JS: 2
    "wednesday", // JS: 3
    "thursday", // JS: 4
    "friday", // JS: 5
    "saturday", // JS: 6
] as const;

export type WeekdayName = (typeof WEEKDAY_MAPPING)[number];

/**
 * A Date object that's guaranteed to be in Stockholm timezone
 */
export class StockholmTime {
    private readonly _utcDate: Date;

    constructor(date: Date | string | number = new Date()) {
        // Store the original UTC date and handle timezone conversions in methods
        this._utcDate = new Date(date);
    }

    /**
     * Get the underlying Date object (in Stockholm timezone)
     */
    toDate(): Date {
        return toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
    }

    /**
     * Convert to UTC Date for database storage
     */
    toUTC(): Date {
        return new Date(this._utcDate);
    }

    /**
     * Format the date using Stockholm timezone
     */
    format(formatString: string): string {
        return formatInTimeZone(this._utcDate, STOCKHOLM_TIMEZONE, formatString);
    }

    /**
     * Get weekday name that matches our database enum
     */
    getWeekdayName(): WeekdayName {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        const dayIndex = stockholmDate.getDay();
        return WEEKDAY_MAPPING[dayIndex];
    }

    /**
     * Get ISO week number
     */
    getISOWeek(): number {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        return getISOWeek(stockholmDate);
    }

    /**
     * Get start of day (00:00:00.000)
     */
    startOfDay(): StockholmTime {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        const startOfDayStockholm = startOfDay(stockholmDate);
        const utcStartOfDay = fromZonedTime(startOfDayStockholm, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcStartOfDay);
    }

    /**
     * End of day (23:59:59.999)
     */
    endOfDay(): StockholmTime {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        const endOfDayStockholm = endOfDay(stockholmDate);
        const utcEndOfDay = fromZonedTime(endOfDayStockholm, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcEndOfDay);
    }

    /**
     * Start of week (Monday 00:00:00.000)
     */
    startOfWeek(): StockholmTime {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        const startOfWeekStockholm = startOfWeek(stockholmDate, { weekStartsOn: 1 });
        const utcStartOfWeek = fromZonedTime(startOfWeekStockholm, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcStartOfWeek);
    }

    /**
     * End of week (Sunday 23:59:59.999)
     */
    endOfWeek(): StockholmTime {
        const stockholmDate = toZonedTime(this._utcDate, STOCKHOLM_TIMEZONE);
        const endOfWeekStockholm = endOfWeek(stockholmDate, { weekStartsOn: 1 });
        const utcEndOfWeek = fromZonedTime(endOfWeekStockholm, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcEndOfWeek);
    }

    /**
     * Check if this time is after another time
     */
    isAfter(other: StockholmTime): boolean {
        return this._utcDate > other._utcDate;
    }

    /**
     * Check if this time is before another time
     */
    isBefore(other: StockholmTime): boolean {
        return this._utcDate < other._utcDate;
    }

    /**
     * Check if this time is between two other times (inclusive)
     */
    isBetween(start: StockholmTime, end: StockholmTime): boolean {
        return this._utcDate >= start._utcDate && this._utcDate <= end._utcDate;
    }

    /**
     * Add minutes to this time
     */
    addMinutes(minutes: number): StockholmTime {
        const newDate = new Date(this._utcDate);
        newDate.setMinutes(newDate.getMinutes() + minutes);
        return new StockholmTime(newDate);
    }

    /**
     * Get time as HH:mm string
     */
    toTimeString(): string {
        return this.format("HH:mm");
    }

    /**
     * Get date as YYYY-MM-DD string
     */
    toDateString(): string {
        return this.format("yyyy-MM-dd");
    }

    /**
     * Get timestamp for database comparisons
     */
    getTime(): number {
        return this._utcDate.getTime();
    }
}

/**
 * TimeProvider interface for dependency injection and testing
 */
export interface ITimeProvider {
    now(): StockholmTime;
    fromDate(date: Date): StockholmTime;
    fromString(dateString: string): StockholmTime;
    parseTime(timeString: string, baseDate?: StockholmTime): StockholmTime;
}

/**
 * Production TimeProvider implementation
 */
export class TimeProvider implements ITimeProvider {
    now(): StockholmTime {
        return new StockholmTime();
    }

    fromDate(date: Date): StockholmTime {
        return new StockholmTime(date);
    }

    fromString(dateString: string): StockholmTime {
        return new StockholmTime(dateString);
    }

    parseTime(timeString: string, baseDate?: StockholmTime): StockholmTime {
        const base = baseDate || this.now().startOfDay();
        const [hours, minutes] = timeString.split(":").map(Number);

        // Work in Stockholm timezone
        const stockholmBase = toZonedTime(base.toUTC(), STOCKHOLM_TIMEZONE);
        stockholmBase.setHours(hours, minutes, 0, 0);

        // Convert back to UTC for storage
        const utcResult = fromZonedTime(stockholmBase, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcResult);
    }
}

/**
 * Mock TimeProvider for testing
 */
export class MockTimeProvider implements ITimeProvider {
    private mockTime: StockholmTime;

    constructor(mockTime: Date | string = new Date()) {
        this.mockTime = new StockholmTime(mockTime);
    }

    setMockTime(time: Date | string): void {
        this.mockTime = new StockholmTime(time);
    }

    now(): StockholmTime {
        return this.mockTime;
    }

    fromDate(date: Date): StockholmTime {
        return new StockholmTime(date);
    }

    fromString(dateString: string): StockholmTime {
        return new StockholmTime(dateString);
    }

    parseTime(timeString: string, baseDate?: StockholmTime): StockholmTime {
        const base = baseDate || this.now().startOfDay();
        const [hours, minutes] = timeString.split(":").map(Number);

        // Work in Stockholm timezone
        const stockholmBase = toZonedTime(base.toUTC(), STOCKHOLM_TIMEZONE);
        stockholmBase.setHours(hours, minutes, 0, 0);

        // Convert back to UTC for storage
        const utcResult = fromZonedTime(stockholmBase, STOCKHOLM_TIMEZONE);
        return new StockholmTime(utcResult);
    }
}

// Singleton instance for the application
let timeProvider: ITimeProvider = new TimeProvider();

/**
 * Get the current time provider instance
 */
export function getTimeProvider(): ITimeProvider {
    return timeProvider;
}

/**
 * Set a custom time provider (useful for testing)
 */
export function setTimeProvider(provider: ITimeProvider): void {
    timeProvider = provider;
}

/**
 * Convenience functions that use the current time provider
 */
export const Time = {
    now: () => getTimeProvider().now(),
    fromDate: (date: Date) => getTimeProvider().fromDate(date),
    fromString: (dateString: string) => getTimeProvider().fromString(dateString),
    parseTime: (timeString: string, baseDate?: StockholmTime) =>
        getTimeProvider().parseTime(timeString, baseDate),
} as const;

/**
 * Type guard to check if a value is a StockholmTime
 */
export function isStockholmTime(value: unknown): value is StockholmTime {
    return value instanceof StockholmTime;
}
