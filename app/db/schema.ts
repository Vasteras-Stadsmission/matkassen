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
    foreignKey,
} from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

// Needed to create a default nanoid value for the primary key
export const nanoid = (length = 14) => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    return customAlphabet(alphabet, length)();
};

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);
export const petSpeciesEnum = pgEnum("pet_species", ["dog", "cat", "bunny", "bird"]);

export const households = pgTable(
    "households",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(6)),
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(), // will determine end of lifecycle
        first_name: varchar("first_name", { length: 50 }).notNull(),
        last_name: varchar("last_name", { length: 50 }).notNull(),
        phone_number: varchar("phone_number", { length: 20 }).notNull(),
        locale: varchar("locale", { length: 2 }).notNull(),
        postal_code: integer("postal_code").notNull(),
    },
    table => [check("postal_code_check", sql`${table.postal_code} BETWEEN 10000 AND 99999`)],
);

export const householdComments = pgTable("household_comments", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    comment: text("comment").notNull(),
});

export const householdMembers = pgTable("household_members", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id),
    age: integer("age").notNull(),
    sex: sexEnum("sex"),
});

export const pets = pgTable("pets", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id),
    species: petSpeciesEnum("species").notNull(),
});

export const foodParcels = pgTable("food_parcels", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    household_id: text("household_id")
        .notNull()
        .references(() => households.id),
    pickup_location: text("pickup_location")
        .notNull()
        .references(() => pickupLocations.id),
    pickup_date_time_earliest: timestamp({ precision: 0, withTimezone: true }).notNull(),
    pickup_date_time_latest: timestamp({ precision: 0, withTimezone: true }).notNull(),
    is_picked_up: boolean("is_picked_up").notNull().default(false),
    url_uid: text("url_uid")
        .notNull()
        .unique()
        .$defaultFn(() => nanoid(6)), // For shared urls
});

export const pickupLocations = pgTable(
    "pickup_locations",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(6)),
        name: text("name").notNull(), // e.g., Västerås Stadsmission, Klara Kyrka, Frihamnskyrkan...
        street_address: text("street_address").notNull(),
        postal_code: integer("postal_code").notNull(),
        parcels_max_per_day: integer("parcels_max_per_day"), // might be null if no max
        contact_name: varchar("contact_name", { length: 50 }),
        contact_email: varchar("contact_email", { length: 255 }),
        contact_phone_number: varchar("contact_phone_number", { length: 20 }),
    },
    table => {
        return [
            check("postal_code_check", sql`${table.postal_code} BETWEEN 10000 AND 99999`),
            check(
                "email_format_check",
                sql`${table.contact_email} ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'`,
            ),
        ];
    },
);

export const householdDietaryRestrictions = pgTable(
    "household_dietary_restrictions",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(6)),
        household_id: text("household_id")
            .notNull()
            .references(() => households.id),
        dietary_restriction_id: text("dietary_restriction_id")
            .notNull()
            .references(() => dietaryRestrictions.id),
    },
    table => [
        foreignKey({
            name: "household_dietary_restrictions_household_id_fk",
            columns: [table.household_id],
            foreignColumns: [households.id],
        }).onDelete("cascade"),

        foreignKey({
            name: "household_dietary_restrictions_restriction_id_fk",
            columns: [table.dietary_restriction_id],
            foreignColumns: [dietaryRestrictions.id],
        }).onDelete("restrict"),
    ],
);

export const dietaryRestrictions = pgTable("dietary_restrictions", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    name: text("name").notNull(), // e.g., gluten, lactose, pork...
});

export const householdAdditionalNeeds = pgTable(
    "household_additional_needs",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(6)),
        household_id: text("household_id")
            .notNull()
            .references(() => households.id),
        additional_need_id: text("additional_need_id")
            .notNull()
            .references(() => additionalNeeds.id),
    },
    table => [
        foreignKey({
            name: "household_additional_needs_household_id_fk",
            columns: [table.household_id],
            foreignColumns: [households.id],
        }).onDelete("cascade"),

        foreignKey({
            name: "household_additional_needs_need_id_fk",
            columns: [table.additional_need_id],
            foreignColumns: [additionalNeeds.id],
        }).onDelete("restrict"),
    ],
);

export const additionalNeeds = pgTable("additional_needs", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(6)),
    need: text("need").notNull(), // e.g., diapers, bus pass, cleaning supplies...
});
