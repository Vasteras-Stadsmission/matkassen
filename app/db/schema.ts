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
    time,
    date,
    index,
    uniqueIndex,
    unique,
} from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

// Needed to create a default nanoid value for the primary key
export const nanoid = (length = 14) => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    return customAlphabet(alphabet, length)();
};

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);

// Define weekday enum for opening hours
export const weekdayEnum = pgEnum("weekday", [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]);

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
    author_github_username: varchar("author_github_username", { length: 50 }).notNull(),
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

export const petSpecies = pgTable("pet_species_types", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    name: text("name").notNull().unique(), // e.g., dog, cat, bunny, bird...
});

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
        default_slot_duration_minutes: integer("default_slot_duration_minutes")
            .default(15)
            .notNull(), // Default slot duration in minutes
        // Persisted count of future food parcels outside opening hours for this location
        outside_hours_count: integer("outside_hours_count").notNull().default(0),
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
            check(
                "pickup_locations_slot_duration_check",
                sql`${table.default_slot_duration_minutes} > 0 AND ${table.default_slot_duration_minutes} <= 240 AND ${table.default_slot_duration_minutes} % 15 = 0`,
            ),
        ];
    },
);

export const pickupLocationSchedules = pgTable(
    "pickup_location_schedules",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        pickup_location_id: text("pickup_location_id")
            .notNull()
            .references(() => pickupLocations.id, { onDelete: "cascade" }),
        start_date: date("start_date").notNull(), // First day the schedule is valid
        end_date: date("end_date").notNull(), // Last day the schedule is valid
        name: text("name").notNull(), // Optional name for the schedule (e.g., "Summer schedule")
    },
    table => [
        // Ensure end_date is after or equal to start_date
        check("schedule_date_range_check", sql`${table.start_date} <= ${table.end_date}`),

        // Add index for better performance when querying schedules by pickup location
        index("idx_pickup_location_schedules_location").on(table.pickup_location_id),

        // Add unique constraint on pickup_location_id and date range to prevent overlaps
        // Note: This will require a migration to create an exclusion constraint, which Drizzle
        // doesn't directly support - you'll need to manually modify the generated migration
        index("idx_pickup_location_schedule_no_overlap").on(table.pickup_location_id),
    ],
);

// Table for each specific day's opening hours within a schedule
export const pickupLocationScheduleDays = pgTable(
    "pickup_location_schedule_days",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        schedule_id: text("schedule_id")
            .notNull()
            .references(() => pickupLocationSchedules.id, { onDelete: "cascade" }),
        weekday: weekdayEnum("weekday").notNull(), // Monday, Tuesday, etc.
        is_open: boolean("is_open").default(true).notNull(), // Whether location is open on this weekday
        opening_time: time("opening_time"), // e.g., 09:00, nullable if is_open is false
        closing_time: time("closing_time"), // e.g., 17:00, nullable if is_open is false
    },
    table => [
        check(
            "opening_hours_check",
            sql`NOT ${table.is_open} OR (${table.opening_time} IS NOT NULL AND ${table.closing_time} IS NOT NULL AND ${table.opening_time} < ${table.closing_time})`,
        ),
    ],
);

// Define SMS intent enum
export const smsIntentEnum = pgEnum("sms_intent", ["pickup_reminder", "consent_enrolment"]);

// Define SMS status enum
export const smsStatusEnum = pgEnum("sms_status", [
    "queued",
    "sending",
    "sent",
    "retrying",
    "failed",
]);

export const foodParcels = pgTable(
    "food_parcels",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(12)), // Use 12-character nanoid for IDs: balances collision resistance (with 62^12 possible values) and keeps IDs short for URLs and database efficiency
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        pickup_location_id: text("pickup_location_id")
            .notNull()
            .references(() => pickupLocations.id),
        pickup_date_time_earliest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        pickup_date_time_latest: timestamp({ precision: 0, withTimezone: true }).notNull(),
        is_picked_up: boolean("is_picked_up").notNull().default(false),
        picked_up_at: timestamp({ precision: 1, withTimezone: true }), // New field for pickup timestamp
        picked_up_by_user_id: varchar("picked_up_by_user_id", { length: 50 }), // GitHub username of admin who marked as picked up
    },
    table => [
        check(
            "pickup_time_range_check",
            sql`${table.pickup_date_time_earliest} <= ${table.pickup_date_time_latest}`,
        ),
        // Unique constraint to prevent duplicate parcels for the same household, location, and time window
        // This ensures idempotency for concurrent parcel creation operations and correctly handles location updates
        unique("food_parcels_household_location_time_unique").on(
            table.household_id,
            table.pickup_location_id,
            table.pickup_date_time_earliest,
            table.pickup_date_time_latest,
        ),
    ],
);

export const outgoingSms = pgTable(
    "outgoing_sms",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(12)),
        intent: smsIntentEnum("intent").notNull(),
        parcel_id: text("parcel_id").references(() => foodParcels.id, { onDelete: "cascade" }), // Nullable for non-parcel intents
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        to_e164: varchar("to_e164", { length: 20 }).notNull(), // E.164 format phone number (+46...)
        text: text("text").notNull(), // Final message body
        status: smsStatusEnum("status").notNull().default("queued"),
        attempt_count: integer("attempt_count").notNull().default(0), // Essential for retry logic
        next_attempt_at: timestamp({ precision: 1, withTimezone: true }), // Essential for scheduling retries
        last_error_message: text("last_error_message"), // Helpful for debugging failures
        idempotency_key: varchar("idempotency_key", { length: 100 }).notNull(), // Stable key for deduplication
        provider_message_id: varchar("provider_message_id", { length: 50 }), // ID from SMS provider
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    },
    table => [
        // Ensure one SMS per parcel for reminder intent
        index("idx_outgoing_sms_parcel_intent_unique").on(table.intent, table.parcel_id),
        // Index for efficient querying ready-to-send SMS
        index("idx_outgoing_sms_ready_to_send").on(table.status, table.next_attempt_at),
        // Unique constraint for idempotency
        uniqueIndex("idx_outgoing_sms_idempotency_unique").on(table.idempotency_key),
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

// CSP violation reports table for security monitoring
export const cspViolations = pgTable("csp_violations", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    blocked_uri: text("blocked_uri"), // The URI that was blocked
    violated_directive: text("violated_directive").notNull(), // Which CSP directive was violated
    effective_directive: text("effective_directive"), // The effective directive that was violated
    original_policy: text("original_policy"), // The full CSP policy
    disposition: varchar("disposition", { length: 10 }).notNull(), // "enforce" or "report-only"
    referrer: text("referrer"), // The referrer of the document in which the violation occurred
    source_file: text("source_file"), // The URI of the document where the violation occurred
    line_number: integer("line_number"), // Line number where violation occurred
    column_number: integer("column_number"), // Column number where violation occurred
    user_agent: text("user_agent"), // User agent string of the client
    script_sample: text("script_sample"), // Sample of the violating script/resource
});

// Users table for storing user preferences
export const users = pgTable("users", {
    id: text("id")
        .primaryKey()
        .notNull()
        .$defaultFn(() => nanoid(8)),
    created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    github_username: varchar("github_username", { length: 100 }).notNull().unique(),
    favorite_pickup_location_id: text("favorite_pickup_location_id").references(
        () => pickupLocations.id,
        { onDelete: "set null" },
    ),
});
