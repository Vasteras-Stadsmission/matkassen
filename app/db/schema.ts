import { sql } from "drizzle-orm";
import {
    pgTable,
    timestamp,
    varchar,
    integer,
    text,
    boolean,
    pgEnum,
    check,
    primaryKey,
} from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

// Needed to create a default nanoid value for the primary key
export const nanoid = (length = 14) => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    return customAlphabet(alphabet, length)();
};

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);

export const households = pgTable(
    "households",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(), // will determine end of lifecycle
        first_name: varchar("first_name", { length: 50 }).notNull(),
        last_name: varchar("last_name", { length: 50 }).notNull(),
        phone_number: varchar("phone_number", { length: 20 }).notNull(),
        locale: varchar("locale", { length: 2 }).notNull(),
        postal_code: varchar("postal_code", { length: 5 }).notNull(),
    },
    table => [
        check(
            "households_postal_code_check",
            sql`LENGTH(${table.postal_code}) = 5 AND ${table.postal_code} ~ '^[0-9]{5}$'`,
        ),
    ],
);

export const householdComments = pgTable("household_comments", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id, { onDelete: "cascade" }),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    comment: text("comment").notNull(),
});

export const householdMembers = pgTable("household_members", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id, { onDelete: "cascade" }),
    age: integer("age").notNull(),
    sex: sexEnum("sex").notNull(),
});

// Pet species table similar to dietary_restrictions
export const petSpecies = pgTable("pet_species_types", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    name: text("name").notNull().unique(), // e.g., dog, cat, bunny, bird...
});

// Updated pets table to reference pet_species instead of using enum
export const pets = pgTable("pets", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id, { onDelete: "cascade" }),
    pet_species_id: text("pet_species_id")
        .notNull()
        .references(() => petSpecies.id, { onDelete: "restrict" }),
});

// Moved pickupLocations before foodParcels to resolve circular reference
export const pickupLocations = pgTable(
    "pickup_locations",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        name: text("name").notNull(), // e.g., Västerås Stadsmission, Klara Kyrka, Frihamnskyrkan...
        street_address: text("street_address").notNull(),
        postal_code: varchar("postal_code", { length: 5 }).notNull(),
        parcels_max_per_day: integer("parcels_max_per_day"), // might be null if no max
        contact_name: varchar("contact_name", { length: 50 }),
        contact_email: varchar("contact_email", { length: 255 }),
        contact_phone_number: varchar("contact_phone_number", { length: 20 }),
    },
    table => {
        return [
            check(
                "pickup_locations_postal_code_check",
                sql`LENGTH(${table.postal_code}) = 5 AND ${table.postal_code} ~ '^[0-9]{5}$'`,
            ),
            check(
                "pickup_locations_email_format_check",
                sql`${table.contact_email} ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'`,
            ),
        ];
    },
);

export const foodParcels = pgTable(
    "food_parcels",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        pickup_location_id: text("pickup_location_id")
            .notNull()
            .references(() => pickupLocations.id),
        pickup_date_time_earliest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        pickup_date_time_latest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        is_picked_up: boolean("is_picked_up").notNull().default(false),
    },
    table => [
        check(
            "pickup_time_range_check",
            sql`${table.pickup_date_time_earliest} <= ${table.pickup_date_time_latest}`,
        ),
    ],
);

export const householdDietaryRestrictions = pgTable(
    "household_dietary_restrictions",
    {
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        dietary_restriction_id: text("dietary_restriction_id")
            .notNull()
            .references(() => dietaryRestrictions.id, { onDelete: "restrict" }),
    },
    table => ({
        pk: primaryKey({ columns: [table.household_id, table.dietary_restriction_id] }),
    }),
);

export const dietaryRestrictions = pgTable("dietary_restrictions", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    name: text("name").notNull(), // e.g., gluten, lactose, pork...
});

export const householdAdditionalNeeds = pgTable(
    "household_additional_needs",
    {
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        additional_need_id: text("additional_need_id")
            .notNull()
            .references(() => additionalNeeds.id, { onDelete: "restrict" }),
    },
    table => ({
        pk: primaryKey({ columns: [table.household_id, table.additional_need_id] }),
    }),
);

export const additionalNeeds = pgTable("additional_needs", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    need: text("need").notNull(), // e.g., diapers, bus pass, cleaning supplies...
});
