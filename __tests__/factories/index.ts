/**
 * Test data factories for integration tests.
 *
 * These factories create real database records using PGlite.
 * Use them to set up test scenarios without verbose insert statements.
 *
 * Example:
 *   const household = await createTestHousehold();
 *   const { location, schedule } = await createTestLocationWithSchedule();
 *   const parcel = await createTestParcel({
 *     household_id: household.id,
 *     pickup_location_id: location.id,
 *   });
 */

export * from "./household.factory";
export * from "./pickup-location.factory";
export * from "./food-parcel.factory";
export * from "./user.factory";
export * from "./sms.factory";
