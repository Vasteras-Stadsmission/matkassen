// Types for the household enrollment feature
export interface Household {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
}

export interface HouseholdMember {
    id?: string;
    age: number;
    sex: string;
}

export interface DietaryRestriction {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface AdditionalNeed {
    id: string;
    need: string;
    isCustom?: boolean;
}

export interface PetSpecies {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface Pet {
    id?: string;
    species: string; // For compatibility with PetsForm
    speciesName?: string; // For display purposes
    count: number;
}

export interface FoodParcel {
    id?: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
}

export interface FoodParcels {
    pickupLocationId: string;
    totalCount: number;
    weekday: string;
    repeatValue: string;
    startDate: Date;
    parcels: FoodParcel[];
}

export interface FormData {
    household: Household;
    members: HouseholdMember[];
    dietaryRestrictions: DietaryRestriction[];
    additionalNeeds: AdditionalNeed[];
    pets: Pet[];
    foodParcels: FoodParcels;
}

export interface EnrollHouseholdResult {
    success: boolean;
    householdId?: string;
    error?: string;
}
