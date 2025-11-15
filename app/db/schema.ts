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
// Default to 12 for food parcels - other tables explicitly specify nanoid(8)
export const nanoid = (length = 12) => {
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
        created_by: varchar("created_by", { length: 50 }), // GitHub username of user who created household (NULL = unknown)
        first_name: varchar("first_name", { length: 50 }).notNull(),
        last_name: varchar("last_name", { length: 50 }).notNull(),
        phone_number: varchar("phone_number", { length: 20 }).notNull(),
        locale: varchar("locale", { length: 2 }).notNull(),
        postal_code: varchar("postal_code", { length: 5 }),
        anonymized_at: timestamp({ precision: 1, withTimezone: true }), // Timestamp when household was anonymized (NULL = active)
        anonymized_by: varchar("anonymized_by", { length: 50 }), // GitHub username of admin who anonymized
    },
    table => [
        check(
            "households_postal_code_check",
            sql`${table.postal_code} IS NULL OR (LENGTH(${table.postal_code}) = 5 AND ${table.postal_code} ~ '^[0-9]{5}$')`,
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

// Global verification questions for enrollment checklist
export const verificationQuestions = pgTable(
    "verification_questions",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        question_text_sv: text("question_text_sv").notNull(), // Swedish question text
        question_text_en: text("question_text_en").notNull(), // English question text
        help_text_sv: text("help_text_sv"), // Optional Swedish help/tooltip text
        help_text_en: text("help_text_en"), // Optional English help/tooltip text
        is_required: boolean("is_required").default(true).notNull(), // Must be checked to proceed
        display_order: integer("display_order").notNull().default(0), // Sort order (lower = first)
        is_active: boolean("is_active").default(true).notNull(), // Soft delete flag
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
        updated_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    },
    table => [
        // Index for querying active questions in display order
        index("idx_global_verification_questions_active_order").on(
            table.is_active,
            table.display_order,
        ),
    ],
);

// Household verification status tracking
export const householdVerificationStatus = pgTable(
    "household_verification_status",
    {
        id: text("id")
            .primaryKey()
            .notNull()
            .$defaultFn(() => nanoid(8)),
        household_id: text("household_id")
            .notNull()
            .references(() => households.id, { onDelete: "cascade" }),
        question_id: text("question_id")
            .notNull()
            .references(() => verificationQuestions.id, { onDelete: "cascade" }),
        is_verified: boolean("is_verified").default(false).notNull(),
        verified_by_user: text("verified_by_user"), // GitHub username who verified
        verified_at: timestamp({ precision: 1, withTimezone: true }),
        notes: text("notes"), // Optional verification notes
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
        updated_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    },
    table => [
        // Composite unique constraint: one verification per household per question
        unique("household_question_unique").on(table.household_id, table.question_id),
        // Index for efficient querying by household
        index("idx_household_verification_household").on(table.household_id),
        // Index for querying verification status
        index("idx_household_verification_status").on(table.household_id, table.is_verified),
    ],
);

// Define SMS intent enum
export const smsIntentEnum = pgEnum("sms_intent", [
    "pickup_reminder",
    "pickup_updated",
    "pickup_cancelled",
    "consent_enrolment",
]);

// Define SMS status enum
export const smsStatusEnum = pgEnum("sms_status", [
    "queued",
    "sending",
    "sent",
    "retrying",
    "failed",
    "cancelled",
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
        deleted_at: timestamp({ precision: 1, withTimezone: true }), // Soft delete timestamp
        deleted_by_user_id: varchar("deleted_by_user_id", { length: 50 }), // GitHub username of admin who deleted the parcel
    },
    table => [
        check(
            "pickup_time_range_check",
            sql`${table.pickup_date_time_earliest} <= ${table.pickup_date_time_latest}`,
        ),
        // NOTE: The unique constraint for preventing duplicate active parcels is implemented as a
        // PARTIAL UNIQUE INDEX in migration 0022_fix-soft-delete-unique-constraint.sql
        // (household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest)
        // WHERE deleted_at IS NULL
        //
        // ALL parcel inserts must use the insertParcels() helper from app/db/insert-parcels.ts
        // which properly handles conflict resolution via onConflictDoNothing with the partial index.
        //
        // The partial index ensures:
        // 1. Only one ACTIVE parcel per (household, location, time) slot
        // 2. Multiple soft-deleted parcels with same values are allowed (preserves history)
        // 3. Parcels can be recreated after soft-deletion (critical business requirement)
        //
        // Do not insert food parcels directly - always use the helper to maintain idempotency.
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
        parcel_id: text("parcel_id").references(() => foodParcels.id, { onDelete: "set null" }), // Nullable for non-parcel intents, SET NULL on delete for data preservation
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
        sent_at: timestamp({ precision: 1, withTimezone: true }), // When SMS was actually sent to provider
        created_at: timestamp({ precision: 1, withTimezone: true }).defaultNow().notNull(),
    },
    table => [
        // Ensure one SMS per parcel for reminder intent
        index("idx_outgoing_sms_parcel_intent_unique").on(table.intent, table.parcel_id),
        // Index for efficient querying ready-to-send SMS
        index("idx_outgoing_sms_ready_to_send").on(table.status, table.next_attempt_at),
        // Unique constraint for idempotency
        uniqueIndex("idx_outgoing_sms_idempotency_unique").on(table.idempotency_key),
        // Partial index for querying sent SMS (only indexes non-null values for efficiency)
        index("idx_outgoing_sms_sent_at")
            .on(table.sent_at)
            .where(sql`${table.sent_at} IS NOT NULL`),
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
