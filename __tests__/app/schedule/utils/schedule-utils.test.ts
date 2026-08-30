import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// Mock the database functionality
vi.mock("../../../../app/db/drizzle", () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({ orderBy: () => [] }),
                innerJoin: () => ({ where: () => ({ orderBy: () => [] }) }),
            }),
        }),
        update: () => ({ set: () => ({ where: () => ({}) }) }),
    },
}));

// Tests for schedule utility functions that don't involve React components
describe("Schedule Utilities", () => {
    let RealDate: DateConstructor;

    beforeEach(() => {
        // Store the real Date constructor
        RealDate = global.Date;

        // Mock the Date constructor
        global.Date = class extends RealDate {
            constructor(...args: any[]) {
                if (args.length === 0) {
                    super();
                } else if (args.length === 1) {
                    super(args[0]);
                } else if (args.length === 2) {
                    super(args[0], args[1]);
                } else if (args.length === 3) {
                    super(args[0], args[1], args[2]);
                } else if (args.length === 4) {
                    super(args[0], args[1], args[2], args[3]);
                } else if (args.length === 5) {
                    super(args[0], args[1], args[2], args[3], args[4]);
                } else if (args.length === 6) {
                    super(args[0], args[1], args[2], args[3], args[4], args[5]);
                } else if (args.length === 7) {
                    super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
                }

                // When called with specific dates we're testing, return fixed dates
                if (args.length === 1 && typeof args[0] === "string") {
                    return new RealDate(args[0]);
                }
                // When called with year, month, day format
                if (args.length >= 3) {
                    const [year, month, day, ...rest] = args;
                    return new RealDate(
                        new RealDate(
                            year,
                            month,
                            day,
                            ...(rest as [number, number, number]),
                        ).toISOString(),
                    );
                }
                // For any other case, pass through to the real Date
                // Note: this return is not needed since super() will handle it
            }

            // Make sure static methods also work
            static now() {
                return RealDate.now();
            }
        } as DateConstructor;
    });

    afterEach(() => {
        // Restore the original Date
        global.Date = RealDate;
    });

    // Other utility functions that don't depend on React components
    describe("Schedule date formatting", () => {
        it("formats dates in Swedish locale", () => {
            const date = new Date("2025-04-16");
            const formatted = date.toLocaleDateString("sv-SE", {
                month: "short",
                day: "numeric",
            });

            // Swedish date format should be like "16 apr"
            expect(formatted.includes("16")).toBe(true);
            expect(formatted.toLowerCase().includes("apr")).toBe(true);
        });

        it("formats times in 24-hour format", () => {
            const date = new Date("2025-04-16T14:30:00");
            const formatted = date.toLocaleTimeString("sv-SE", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });

            // 24-hour time should be "14:30"
            expect(formatted).toBe("14:30");
        });
    });
});
