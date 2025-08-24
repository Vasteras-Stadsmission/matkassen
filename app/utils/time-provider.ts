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
    private readonly _date: Date;

    constructor(date: Date | string | number = new Date()) {
        this._date = toZonedTime(new Date(date), STOCKHOLM_TIMEZONE);
    }

    /**
     * Get the underlying Date object (in Stockholm timezone)
     */
    toDate(): Date {
        return new Date(this._date);
    }

    /**
     * Convert to UTC Date for database storage
     */
    toUTC(): Date {
        return fromZonedTime(this._date, STOCKHOLM_TIMEZONE);
    }

    /**
     * Format the date using Stockholm timezone
     */
    format(formatString: string): string {
        return formatInTimeZone(this.toUTC(), STOCKHOLM_TIMEZONE, formatString);
    }

    /**
     * Get weekday name that matches our database enum
     */
    getWeekdayName(): WeekdayName {
        const dayIndex = this._date.getDay();
        return WEEKDAY_MAPPING[dayIndex];
    }

    /**
     * Get ISO week number
     */
    getISOWeek(): number {
        return getISOWeek(this._date);
    }

    /**
     * Get start of day (00:00:00.000)
     */
    startOfDay(): StockholmTime {
        return new StockholmTime(startOfDay(this._date));
    }

    /**
     * End of day (23:59:59.999)
     */
    endOfDay(): StockholmTime {
        return new StockholmTime(endOfDay(this._date));
    }

    /**
     * Start of week (Monday 00:00:00.000)
     */
    startOfWeek(): StockholmTime {
        return new StockholmTime(startOfWeek(this._date, { weekStartsOn: 1 }));
    }

    /**
     * End of week (Sunday 23:59:59.999)
     */
    endOfWeek(): StockholmTime {
        return new StockholmTime(endOfWeek(this._date, { weekStartsOn: 1 }));
    }

    /**
     * Check if this time is after another time
     */
    isAfter(other: StockholmTime): boolean {
        return this._date > other._date;
    }

    /**
     * Check if this time is before another time
     */
    isBefore(other: StockholmTime): boolean {
        return this._date < other._date;
    }

    /**
     * Check if this time is between two other times (inclusive)
     */
    isBetween(start: StockholmTime, end: StockholmTime): boolean {
        return this._date >= start._date && this._date <= end._date;
    }

    /**
     * Add minutes to this time
     */
    addMinutes(minutes: number): StockholmTime {
        const newDate = new Date(this._date);
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
        return this._date.getTime();
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

        const result = base.toDate();
        result.setHours(hours, minutes, 0, 0);

        return new StockholmTime(result);
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

        const result = base.toDate();
        result.setHours(hours, minutes, 0, 0);

        return new StockholmTime(result);
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
