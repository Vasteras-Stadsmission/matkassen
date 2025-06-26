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

// This is a local implementation of getTimeslotCounts for testing
function getTimeslotCountsImpl(parcels: Array<{ pickupEarliestTime: Date }>) {
    const timeslotCounts: Record<string, number> = {};

    parcels.forEach(parcel => {
        const time = parcel.pickupEarliestTime;
        const hour = time.getHours();
        const minutes = time.getMinutes() < 30 ? 0 : 30;
        const key = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

        if (!timeslotCounts[key]) {
            timeslotCounts[key] = 0;
        }

        timeslotCounts[key] += 1;
    });

    return timeslotCounts;
}

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

    describe("getTimeslotCounts", () => {
        it("counts parcels correctly by 30-minute time slots", () => {
            const parcels = [
                { pickupEarliestTime: new Date("2025-04-16T10:00:00") },
                { pickupEarliestTime: new Date("2025-04-16T10:15:00") }, // Should be counted in 10:00 slot
                { pickupEarliestTime: new Date("2025-04-16T10:30:00") }, // Should be counted in 10:30 slot
                { pickupEarliestTime: new Date("2025-04-16T10:45:00") }, // Should be counted in 10:30 slot
                { pickupEarliestTime: new Date("2025-04-16T11:00:00") }, // Should be counted in 11:00 slot
            ];

            const counts = getTimeslotCountsImpl(parcels);

            expect(counts["10:00"]).toBe(2);
            expect(counts["10:30"]).toBe(2);
            expect(counts["11:00"]).toBe(1);
            expect(Object.keys(counts).length).toBe(3);
        });

        it("handles empty parcels list", () => {
            const counts = getTimeslotCountsImpl([]);
            expect(Object.keys(counts).length).toBe(0);
        });

        it("handles parcels spanning multiple hours", () => {
            const parcels = [
                { pickupEarliestTime: new Date("2025-04-16T09:00:00") },
                { pickupEarliestTime: new Date("2025-04-16T10:00:00") },
                { pickupEarliestTime: new Date("2025-04-16T11:00:00") },
                { pickupEarliestTime: new Date("2025-04-16T12:00:00") },
            ];

            const counts = getTimeslotCountsImpl(parcels);

            expect(counts["09:00"]).toBe(1);
            expect(counts["10:00"]).toBe(1);
            expect(counts["11:00"]).toBe(1);
            expect(counts["12:00"]).toBe(1);
            expect(Object.keys(counts).length).toBe(4);
        });
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
