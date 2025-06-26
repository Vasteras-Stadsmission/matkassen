// Type stubs for app modules to prevent TypeScript from processing actual app files during test compilation

declare module "../../../../app/[locale]/schedule/actions" {
    export interface FoodParcel {
        id: string;
        householdName: string;
        pickupDate: Date;
        pickupEarliestTime: Date;
        pickupLatestTime: Date;
    }

    export interface LocationScheduleInfo {
        [key: string]: any;
    }

    export function updateFoodParcelSchedule(id: string, data: any): Promise<any>;
    export function getLocationSlotDuration(locationId: string): Promise<number>;
    export function getPickupLocationSchedules(locationId: string): Promise<any[]>;
}

declare module "../../../../app/utils/date-utils" {
    export function getISOWeekNumber(date: Date): number;
    export function getWeekDates(year: number, week: number): Date[];
    export function formatStockholmDate(date: Date): string;
    export function toStockholmTime(date: Date): Date;
    export function fromStockholmTime(date: Date): Date;
    export function isPastTimeSlot(date: Date): boolean;
}

declare module "../../../../app/utils/schedule/schedule-validation" {
    export function doDateRangesOverlap(range1: any, range2: any): boolean;
    export function findOverlappingSchedule(schedules: any[], newSchedule: any): any;
    export function getWeekDateRange(
        year: number,
        week: number,
    ): { startDate: Date; endDate: Date };
}

declare module "../../../../app/utils/schedule/location-availability" {
    export function isTimeAvailable(date: Date, time: string, locationId: string): boolean;
    export function isDateAvailable(date: Date, locationId: string): boolean;
    export function getAvailableTimeRange(
        date: Date,
        schedules: any[],
    ): { openingTime: string | null; closingTime: string | null };
}

declare module "../../../../app/[locale]/handout-locations/components/schedules/WeekPicker" {
    export interface WeekPickerProps {
        label: string;
        onChange: (value: { year: number; week: number }) => void;
        value?: { year: number; week: number };
    }
    export function WeekPicker(props: WeekPickerProps): JSX.Element;
}

declare module "../../../../app/[locale]/households/enroll/client-actions" {
    export function submitHouseholdEnrollment(data: any): Promise<any>;
}

declare module "../../../../app/[locale]/households/[id]/edit/actions" {
    export function updateHousehold(id: string, data: any): Promise<any>;
}

declare module "../../../app/db/actions" {
    export function logCspReport(report: any): Promise<void>;
}

declare module "../../../app/schedule/actions" {
    export function updateFoodParcelSchedule(id: string, data: any): Promise<any>;
    export function getLocationSlotDuration(locationId: string): Promise<number>;
    export function getPickupLocationSchedules(locationId: string): Promise<any[]>;
}
