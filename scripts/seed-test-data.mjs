#!/usr/bin/env node

import { createRequire } from "node:module";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const { postgresJsSslOption } = require("../app/db/database-ssl.cjs");

const ALLOWED_ENV_NAMES = new Set(["local", "development", "test", "staging"]);
const SEED_ACTOR = "seed-test-data";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS_BY_UTC_DAY = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];

function hostnameFromEnvValue(value) {
    if (!value) return "";
    if (value.includes("://")) {
        try {
            return new URL(value).hostname.toLowerCase();
        } catch {
            return value.toLowerCase();
        }
    }
    return value.toLowerCase();
}

function isProductionHost(value) {
    const hostname = hostnameFromEnvValue(value);
    return hostname === "matcentralen.com" || hostname === "www.matcentralen.com";
}

function assertSafeTarget() {
    const databaseUrl = process.env.DATABASE_URL;
    const envName = process.env.ENV_NAME || "";
    const hostHints = [
        process.env.DOMAIN_NAME,
        process.env.AUTH_URL,
        process.env.NEXTAUTH_URL,
        process.env.NEXT_PUBLIC_APP_URL,
    ];

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required.");
    }

    if (process.env.ALLOW_TEST_SEED !== "1") {
        throw new Error("Refusing to seed without ALLOW_TEST_SEED=1.");
    }

    if (!ALLOWED_ENV_NAMES.has(envName)) {
        throw new Error(
            `Refusing to seed ENV_NAME=${envName || "unset"}. Allowed values: local, development, test, staging.`,
        );
    }

    if (envName === "production" || hostHints.some(isProductionHost)) {
        throw new Error("Refusing to seed production.");
    }
}

function addDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function atUtcDate(daysFromToday, hour, minute = 0) {
    const date = addDays(new Date(), daysFromToday);
    date.setUTCHours(hour, minute, 0, 0);
    return date;
}

function atOpenUtcDate(location, daysFromToday, hour, minute = 0, direction = "future") {
    const step = direction === "past" ? -1 : 1;
    const date = atUtcDate(daysFromToday, hour, minute);

    for (let attempt = 0; attempt < WEEKDAYS.length * 2; attempt++) {
        if (location.openDays.has(WEEKDAYS_BY_UTC_DAY[date.getUTCDay()])) {
            return date;
        }
        date.setUTCDate(date.getUTCDate() + step);
    }

    throw new Error(`No open weekday found for ${location.id}.`);
}

function seedData() {
    const currentYear = new Date().getUTCFullYear();
    const scheduleStart = `${currentYear - 1}-01-01`;
    const scheduleEnd = `${currentYear + 1}-12-31`;

    const locations = [
        {
            id: "stgloc01",
            name: "TEST Demo City",
            streetAddress: "Stora gatan 1",
            postalCode: "72212",
            maxPerDay: 20,
            maxPerSlot: 4,
            slotDuration: 15,
            openDays: new Set(["monday", "wednesday", "friday"]),
            openingTime: "09:00",
            closingTime: "12:00",
        },
        {
            id: "stgloc02",
            name: "TEST Demo West",
            streetAddress: "Vastra gatan 2",
            postalCode: "72460",
            maxPerDay: 12,
            maxPerSlot: 3,
            slotDuration: 30,
            openDays: new Set(["tuesday", "thursday"]),
            openingTime: "13:00",
            closingTime: "16:00",
        },
        {
            id: "stgloc03",
            name: "TEST Demo Saturday",
            streetAddress: "Helggatan 3",
            postalCode: "72215",
            maxPerDay: null,
            maxPerSlot: 2,
            slotDuration: 15,
            openDays: new Set(["saturday"]),
            openingTime: "10:00",
            closingTime: "12:00",
        },
    ];
    const [cityLocation, westLocation, saturdayLocation] = locations;

    const households = [
        {
            id: "stghh001",
            firstName: "Alma",
            lastName: "TestUpcoming",
            phone: "+46709990001",
            locale: "sv",
            primaryLocationId: "stgloc01",
        },
        {
            id: "stghh002",
            firstName: "Boris",
            lastName: "TestPast",
            phone: "+46709990002",
            locale: "sv",
            primaryLocationId: "stgloc02",
        },
        {
            id: "stghh003",
            firstName: "Clara",
            lastName: "TestOldPhoneSms",
            phone: "+46709990003",
            locale: "sv",
            primaryLocationId: "stgloc01",
        },
        {
            id: "stghh004",
            firstName: "David",
            lastName: "TestDeliveredSms",
            phone: "+46709990004",
            locale: "sv",
            primaryLocationId: "stgloc01",
        },
        {
            id: "stghh005",
            firstName: "Elin",
            lastName: "TestSmsFailure",
            phone: "+46709990005",
            locale: "sv",
            primaryLocationId: "stgloc02",
        },
        {
            id: "stghh006",
            firstName: "Farah",
            lastName: "TestBalanceFailure",
            phone: "+46709990006",
            locale: "sv",
            primaryLocationId: "stgloc03",
        },
        {
            id: "stghh007",
            firstName: "Gunnar",
            lastName: "TestPhoneEdit",
            phone: "+46709990007",
            locale: "sv",
            primaryLocationId: "stgloc02",
        },
    ];

    const parcels = [
        {
            id: "stgpar001",
            householdId: "stghh001",
            locationId: "stgloc01",
            earliest: atOpenUtcDate(cityLocation, 7, 8, 0),
            latest: atOpenUtcDate(cityLocation, 7, 8, 30),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
        {
            id: "stgpar002",
            householdId: "stghh002",
            locationId: "stgloc02",
            earliest: atOpenUtcDate(westLocation, -7, 12, 0, "past"),
            latest: atOpenUtcDate(westLocation, -7, 12, 30, "past"),
            pickedUp: true,
            pickedUpAt: atOpenUtcDate(westLocation, -7, 12, 15, "past"),
            noShowAt: null,
        },
        {
            id: "stgpar003",
            householdId: "stghh003",
            locationId: "stgloc01",
            earliest: atOpenUtcDate(cityLocation, 14, 8, 0),
            latest: atOpenUtcDate(cityLocation, 14, 8, 30),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
        {
            id: "stgpar004",
            householdId: "stghh004",
            locationId: "stgloc01",
            earliest: atOpenUtcDate(cityLocation, 15, 8, 30),
            latest: atOpenUtcDate(cityLocation, 15, 9, 0),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
        {
            id: "stgpar005",
            householdId: "stghh005",
            locationId: "stgloc02",
            earliest: atOpenUtcDate(westLocation, 8, 12, 0),
            latest: atOpenUtcDate(westLocation, 8, 12, 30),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
        {
            id: "stgpar006",
            householdId: "stghh006",
            locationId: "stgloc03",
            earliest: atOpenUtcDate(saturdayLocation, 9, 9, 0),
            latest: atOpenUtcDate(saturdayLocation, 9, 9, 30),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
        {
            id: "stgpar007",
            householdId: "stghh007",
            locationId: "stgloc02",
            earliest: atOpenUtcDate(westLocation, 10, 12, 30),
            latest: atOpenUtcDate(westLocation, 10, 13, 0),
            pickedUp: false,
            pickedUpAt: null,
            noShowAt: null,
        },
    ];

    const sms = [
        {
            id: "stgsms001",
            householdId: "stghh003",
            intent: "enrolment",
            to: "+46709990999",
            text: "TEST old-phone enrollment SMS",
            status: "sent",
            providerStatus: "delivered",
            balanceFailure: false,
            lastError: null,
            sentAt: atUtcDate(-1, 8, 0),
        },
        {
            id: "stgsms002",
            householdId: "stghh004",
            intent: "enrolment",
            to: "+46709990004",
            text: "TEST delivered enrollment SMS",
            status: "sent",
            providerStatus: "delivered",
            balanceFailure: false,
            lastError: null,
            sentAt: atUtcDate(-1, 8, 5),
        },
        {
            id: "stgsms003",
            householdId: "stghh005",
            parcelId: "stgpar005",
            intent: "pickup_reminder",
            to: "+46709990005",
            text: "TEST failed reminder SMS",
            status: "failed",
            providerStatus: "failed",
            balanceFailure: false,
            lastError: "TEST seeded provider failure",
            sentAt: null,
        },
        {
            id: "stgsms004",
            householdId: "stghh006",
            parcelId: "stgpar006",
            intent: "pickup_reminder",
            to: "+46709990006",
            text: "TEST balance failure reminder SMS",
            status: "failed",
            providerStatus: null,
            balanceFailure: true,
            lastError: "TEST seeded balance failure",
            sentAt: null,
        },
    ];

    return {
        user: {
            id: "stguser1",
            githubUsername: "matkassen-seed",
            displayName: "Matkassen Seed Staff",
        },
        verificationQuestion: {
            id: "stgver01",
            text: "TEST: Household has been informed about personal data handling",
            helpText: "Seeded checklist item for local and staging smoke tests.",
            displayOrder: 900,
        },
        locations,
        schedules: locations.map(location => ({
            id: `${location.id}-sched`,
            locationId: location.id,
            name: `${location.name} standard schedule`,
            startDate: scheduleStart,
            endDate: scheduleEnd,
            days: WEEKDAYS.map(weekday => ({
                id: `${location.id}-${weekday}`,
                weekday,
                isOpen: location.openDays.has(weekday),
                openingTime: location.openDays.has(weekday) ? location.openingTime : null,
                closingTime: location.openDays.has(weekday) ? location.closingTime : null,
            })),
        })),
        households,
        householdMembers: [
            { id: "stgmem001", householdId: "stghh001", age: 42, sex: "female" },
            { id: "stgmem002", householdId: "stghh001", age: 9, sex: "male" },
            { id: "stgmem003", householdId: "stghh002", age: 51, sex: "male" },
            { id: "stgmem004", householdId: "stghh007", age: 33, sex: "other" },
        ],
        parcels,
        sms,
    };
}

async function seed(sql) {
    const data = seedData();

    await sql.begin(async tx => {
        await tx`
            insert into users (
                id, github_username, display_name, first_name, last_name, role
            )
            values (
                ${data.user.id},
                ${data.user.githubUsername},
                ${data.user.displayName},
                'Seed',
                'Staff',
                'handout_staff'
            )
            on conflict (id) do update set
                github_username = excluded.github_username,
                display_name = excluded.display_name,
                first_name = excluded.first_name,
                last_name = excluded.last_name,
                role = excluded.role,
                deactivated_at = null
        `;

        await tx`
            insert into verification_questions (
                id, question_text, help_text, is_required, display_order, is_active, updated_at
            )
            values (
                ${data.verificationQuestion.id},
                ${data.verificationQuestion.text},
                ${data.verificationQuestion.helpText},
                true,
                ${data.verificationQuestion.displayOrder},
                true,
                now()
            )
            on conflict (id) do update set
                question_text = excluded.question_text,
                help_text = excluded.help_text,
                is_required = excluded.is_required,
                display_order = excluded.display_order,
                is_active = excluded.is_active,
                updated_at = now()
        `;

        for (const location of data.locations) {
            await tx`
                insert into pickup_locations (
                    id,
                    name,
                    street_address,
                    postal_code,
                    parcels_max_per_day,
                    max_parcels_per_slot,
                    contact_name,
                    contact_email,
                    contact_phone_number,
                    default_slot_duration_minutes
                )
                values (
                    ${location.id},
                    ${location.name},
                    ${location.streetAddress},
                    ${location.postalCode},
                    ${location.maxPerDay},
                    ${location.maxPerSlot},
                    'Seed User',
                    'seed@example.invalid',
                    '+46709990000',
                    ${location.slotDuration}
                )
                on conflict (id) do update set
                    name = excluded.name,
                    street_address = excluded.street_address,
                    postal_code = excluded.postal_code,
                    parcels_max_per_day = excluded.parcels_max_per_day,
                    max_parcels_per_slot = excluded.max_parcels_per_slot,
                    contact_name = excluded.contact_name,
                    contact_email = excluded.contact_email,
                    contact_phone_number = excluded.contact_phone_number,
                    default_slot_duration_minutes = excluded.default_slot_duration_minutes
            `;
        }

        for (const schedule of data.schedules) {
            await tx`
                insert into pickup_location_schedules (
                    id, pickup_location_id, start_date, end_date, name, created_by, updated_at, updated_by
                )
                values (
                    ${schedule.id},
                    ${schedule.locationId},
                    ${schedule.startDate},
                    ${schedule.endDate},
                    ${schedule.name},
                    ${SEED_ACTOR},
                    now(),
                    ${SEED_ACTOR}
                )
                on conflict (id) do update set
                    pickup_location_id = excluded.pickup_location_id,
                    start_date = excluded.start_date,
                    end_date = excluded.end_date,
                    name = excluded.name,
                    updated_at = now(),
                    updated_by = excluded.updated_by
            `;

            await tx`delete from pickup_location_schedule_days where schedule_id = ${schedule.id}`;

            for (const day of schedule.days) {
                await tx`
                    insert into pickup_location_schedule_days (
                        id, schedule_id, weekday, is_open, opening_time, closing_time
                    )
                    values (
                        ${day.id},
                        ${schedule.id},
                        ${day.weekday},
                        ${day.isOpen},
                        ${day.openingTime},
                        ${day.closingTime}
                    )
                `;
            }
        }

        for (const household of data.households) {
            await tx`
                insert into households (
                    id,
                    created_by,
                    responsible_user_id,
                    first_name,
                    last_name,
                    phone_number,
                    locale,
                    anonymized_at,
                    anonymized_by,
                    primary_pickup_location_id
                )
                values (
                    ${household.id},
                    ${SEED_ACTOR},
                    ${data.user.id},
                    ${household.firstName},
                    ${household.lastName},
                    ${household.phone},
                    ${household.locale},
                    null,
                    null,
                    ${household.primaryLocationId}
                )
                on conflict (id) do update set
                    created_by = excluded.created_by,
                    responsible_user_id = excluded.responsible_user_id,
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    phone_number = excluded.phone_number,
                    locale = excluded.locale,
                    anonymized_at = null,
                    anonymized_by = null,
                    primary_pickup_location_id = excluded.primary_pickup_location_id
            `;
        }

        await tx`delete from household_members where household_id in ${tx(data.households.map(h => h.id))}`;
        for (const member of data.householdMembers) {
            await tx`
                insert into household_members (id, household_id, age, sex)
                values (${member.id}, ${member.householdId}, ${member.age}, ${member.sex})
            `;
        }

        for (const parcel of data.parcels) {
            await tx`
                insert into food_parcels (
                    id,
                    household_id,
                    pickup_location_id,
                    pickup_date_time_earliest,
                    pickup_date_time_latest,
                    is_picked_up,
                    picked_up_at,
                    picked_up_by_user_id,
                    deleted_at,
                    deleted_by_user_id,
                    no_show_at,
                    no_show_by_user_id
                )
                values (
                    ${parcel.id},
                    ${parcel.householdId},
                    ${parcel.locationId},
                    ${parcel.earliest},
                    ${parcel.latest},
                    ${parcel.pickedUp},
                    ${parcel.pickedUpAt},
                    ${parcel.pickedUp ? SEED_ACTOR : null},
                    null,
                    null,
                    ${parcel.noShowAt},
                    ${parcel.noShowAt ? SEED_ACTOR : null}
                )
                on conflict (id) do update set
                    household_id = excluded.household_id,
                    pickup_location_id = excluded.pickup_location_id,
                    pickup_date_time_earliest = excluded.pickup_date_time_earliest,
                    pickup_date_time_latest = excluded.pickup_date_time_latest,
                    is_picked_up = excluded.is_picked_up,
                    picked_up_at = excluded.picked_up_at,
                    picked_up_by_user_id = excluded.picked_up_by_user_id,
                    deleted_at = null,
                    deleted_by_user_id = null,
                    no_show_at = excluded.no_show_at,
                    no_show_by_user_id = excluded.no_show_by_user_id
            `;
        }

        for (const sms of data.sms) {
            await tx`
                insert into outgoing_sms (
                    id,
                    intent,
                    parcel_id,
                    household_id,
                    to_e164,
                    text,
                    status,
                    attempt_count,
                    next_attempt_at,
                    last_error_message,
                    idempotency_key,
                    provider_message_id,
                    provider_status,
                    provider_status_updated_at,
                    balance_failure,
                    dismissed_at,
                    dismissed_by_user_id,
                    sent_at
                )
                values (
                    ${sms.id},
                    ${sms.intent},
                    ${sms.parcelId ?? null},
                    ${sms.householdId},
                    ${sms.to},
                    ${sms.text},
                    ${sms.status},
                    ${sms.status === "failed" ? 3 : 1},
                    null,
                    ${sms.lastError},
                    ${sms.parcelId ? `${sms.intent}|${sms.parcelId}` : `seed-test-data:${sms.id}`},
                    ${sms.providerStatus ? `seed-provider-${sms.id}` : null},
                    ${sms.providerStatus},
                    ${sms.providerStatus ? new Date() : null},
                    ${sms.balanceFailure},
                    null,
                    null,
                    ${sms.sentAt}
                )
                on conflict (id) do update set
                    intent = excluded.intent,
                    parcel_id = excluded.parcel_id,
                    household_id = excluded.household_id,
                    to_e164 = excluded.to_e164,
                    text = excluded.text,
                    status = excluded.status,
                    attempt_count = excluded.attempt_count,
                    next_attempt_at = excluded.next_attempt_at,
                    last_error_message = excluded.last_error_message,
                    idempotency_key = excluded.idempotency_key,
                    provider_message_id = excluded.provider_message_id,
                    provider_status = excluded.provider_status,
                    provider_status_updated_at = excluded.provider_status_updated_at,
                    balance_failure = excluded.balance_failure,
                    dismissed_at = null,
                    dismissed_by_user_id = null,
                    sent_at = excluded.sent_at
            `;
        }
    });

    return {
        locations: data.locations.length,
        schedules: data.schedules.length,
        households: data.households.length,
        parcels: data.parcels.length,
        sms: data.sms.length,
    };
}

async function main() {
    assertSafeTarget();

    const ssl = postgresJsSslOption();
    const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        ...(ssl !== undefined ? { ssl } : {}),
    });

    try {
        const result = await seed(sql);
        console.log(
            `Seeded test data: ${result.locations} locations, ${result.schedules} schedules, ${result.households} households, ${result.parcels} parcels, ${result.sms} SMS records.`,
        );
    } finally {
        await sql.end();
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
