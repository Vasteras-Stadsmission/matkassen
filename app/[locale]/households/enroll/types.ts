// Types for the household enrollment feature

export interface Household {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code?: string | null;
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
    parcels: FoodParcel[];
}

export interface PickupLocation {
    id: string;
    name: string;
    street_address: string;
    parcels_max_per_day: number | null;
}

export interface LocationCapacity {
    hasLimit: boolean;
    maxPerDay: number | null;
    dateCapacities: Record<string, number>;
}

export interface GithubUserData {
    avatar_url: string;
    name: string | null;
}

export interface Comment {
    id?: string;
    created_at?: Date;
    author_github_username: string;
    comment: string;
    githubUserData?: GithubUserData | null;
}

export interface FormData {
    household: Household;
    members: HouseholdMember[];
    dietaryRestrictions: DietaryRestriction[];
    additionalNeeds: AdditionalNeed[];
    pets: Pet[];
    foodParcels: FoodParcels;
    comments?: Comment[];
}

export interface EnrollHouseholdResult {
    success: boolean;
    householdId?: string;
    error?: string;
}

// Types for creating entities
export interface HouseholdCreateData {
    headOfHousehold: {
        firstName: string;
        lastName: string;
        phoneNumber: string;
        postalCode?: string | null;
        locale?: string;
    };
    members: HouseholdMemberData[];
    dietaryRestrictions: DietaryRestrictionData[];
    additionalNeeds: AdditionalNeedData[];
    pets: {
        species: string;
        speciesName?: string;
        count?: number;
    }[];
    foodParcels: {
        pickupLocationId: string;
        parcels: FoodParcelCreateData[];
    };
}

export interface HouseholdMemberData {
    firstName: string;
    lastName: string;
    age: number;
    sex: string;
}

export interface DietaryRestrictionData {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface AdditionalNeedData {
    id: string;
    need: string;
    isCustom?: boolean;
}

export interface FoodParcelCreateData {
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
}
