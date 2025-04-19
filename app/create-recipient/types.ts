// Types for the create-recipient feature
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

// Updated to match the new database schema
export interface PetSpecies {
    id: string;
    name: string;
    isCustom?: boolean;
}

// Updated to reference PetSpecies instead of having species enum
export interface Pet {
    id?: string;
    petSpeciesId: string;
    petSpeciesName?: string; // For display purposes
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

export interface CreateHouseholdResult {
    success: boolean;
    householdId?: string;
    error?: string;
}
