export interface DailyCapacityState {
    isLimited: boolean;
    isFull: boolean;
    isOverCapacity: boolean;
    excess: number;
    remaining: number | null;
}

export function getDailyCapacityState(booked: number, limit: number | null): DailyCapacityState {
    if (limit === null) {
        return {
            isLimited: false,
            isFull: false,
            isOverCapacity: false,
            excess: 0,
            remaining: null,
        };
    }

    return {
        isLimited: true,
        isFull: booked >= limit,
        isOverCapacity: booked > limit,
        excess: Math.max(0, booked - limit),
        remaining: Math.max(0, limit - booked),
    };
}
