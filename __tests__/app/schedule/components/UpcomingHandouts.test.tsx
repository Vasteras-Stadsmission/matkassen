import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { UpcomingHandouts } from "@/app/[locale]/schedule/components/UpcomingHandouts";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string, params?: Record<string, string>) =>
        params ? `${key} ${Object.values(params).join(" ")}` : key,
    useFormatter: () => ({
        dateTime: (date: Date) => date.toISOString().slice(0, 10),
    }),
}));

function renderUpcoming(props: Parameters<typeof UpcomingHandouts>[0]) {
    return render(
        <MantineProvider>
            <UpcomingHandouts {...props} />
        </MantineProvider>,
    );
}

describe("UpcomingHandouts", () => {
    it("lists each upcoming day with booked/limit and its capacity status", () => {
        renderUpcoming({
            hasUpcomingSchedule: true,
            handouts: [
                { date: "2026-11-27", booked: 17, limit: 20 },
                { date: "2026-11-30", booked: 20, limit: 20 },
            ],
        });

        expect(screen.getByText("upcoming")).toBeTruthy();
        expect(screen.getByText("2026-11-27")).toBeTruthy();
        expect(screen.getByText("17/20")).toBeTruthy();
        expect(screen.getByText("almostFull")).toBeTruthy();
        expect(screen.getByText("20/20")).toBeTruthy();
        expect(screen.getByText("full")).toBeTruthy();
    });

    it("shows how many are over the limit, and a count without limit", () => {
        renderUpcoming({
            hasUpcomingSchedule: true,
            handouts: [
                { date: "2026-11-26", booked: 14, limit: 12 },
                { date: "2026-11-28", booked: 9, limit: null },
            ],
        });

        expect(screen.getByText("14/12")).toBeTruthy();
        expect(screen.getByText("overBy 2")).toBeTruthy();
        expect(screen.getByText("bookedUnlimited 9")).toBeTruthy();
    });

    it("says so when the schedule has nothing in the next 14 days", () => {
        renderUpcoming({ hasUpcomingSchedule: true, handouts: [] });

        expect(screen.getByText("noUpcomingHandouts")).toBeTruthy();
    });

    it("leaves a location without opening hours to the existing badge", () => {
        renderUpcoming({ hasUpcomingSchedule: false, handouts: [] });

        expect(screen.queryByText("noUpcomingHandouts")).toBeNull();
        expect(screen.queryByText("upcoming")).toBeNull();
    });

    it("shows nothing when the look-ahead couldn't be loaded", () => {
        renderUpcoming({ hasUpcomingSchedule: true, handouts: undefined });

        expect(screen.queryByText("noUpcomingHandouts")).toBeNull();
        expect(screen.queryByText("upcoming")).toBeNull();
    });
});
