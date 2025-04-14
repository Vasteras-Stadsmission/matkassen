import { sql } from "drizzle-orm";
import {
    pgTable,
    uuid,
    serial,
    timestamp,
    varchar,
    integer,
    text,
    boolean,
    pgEnum,
    check,
} from "drizzle-orm/pg-core";

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);
export const petSpeciesEnum = pgEnum("pet_species", ["dog", "cat", "bunny", "bird"]);

export const households = pgTable(
    "households",
    {
        id: uuid("id").primaryKey(),
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
    id: integer("id").primaryKey(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    comment: text("comment").notNull(),
});

export const householdMembers = pgTable("household_members", {
    id: integer("id").primaryKey(),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    age: integer("age").notNull(),
    sex: sexEnum("sex"),
});

export const pets = pgTable("pets", {
    id: integer("id").primaryKey(),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    species: petSpeciesEnum("species").notNull(),
});

export const foodParcels = pgTable("food_parcels", {
    id: uuid("id").primaryKey(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    pickup_location: integer("pickup_location")
        .notNull()
        .references(() => pickupLocations.id),
    pickup_date_time_earliest: timestamp({ precision: 0, withTimezone: true }).notNull(),
    pickup_date_time_latest: timestamp({ precision: 0, withTimezone: true }).notNull(),
    is_picked_up: boolean("is_picked_up").notNull().default(false),
    url_uid: text("url_uid").notNull().unique(), // For shared urls, or make the id a nanoid directly?
});

export const pickupLocations = pgTable(
    "pickup_locations",
    {
        id: serial("id").primaryKey(), // auto-incremented integer
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

export const householdDietaryRestrictions = pgTable("household_dietary_restrictions", {
    id: serial("id").primaryKey(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    dietary_restriction_id: integer("dietary_restriction_id")
        .notNull()
        .references(() => dietaryRestrictions.id),
});

export const dietaryRestrictions = pgTable("dietary_restrictions", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // e.g., gluten, lactose, pork...
});

export const householdAdditionalNeeds = pgTable("household_additional_needs", {
    id: serial("id").primaryKey(),
    household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
    additional_need_id: integer("additional_need_id")
        .notNull()
        .references(() => additionalNeeds.id), // TODO: Change to https://orm.drizzle.team/docs/relations#one-to-many etc
});

export const additionalNeeds = pgTable("additional_needs", {
    id: serial("id").primaryKey(),
    need: text("need").notNull(), // e.g., diapers, bus pass, cleaning supplies...
});
