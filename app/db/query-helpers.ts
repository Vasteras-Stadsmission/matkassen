/**
 * Database query helper functions
 * Centralized logic for common query patterns
 */

import { isNull, isNotNull } from "drizzle-orm";
import { foodParcels } from "./schema";

/**
 * Helper to create WHERE condition that filters out soft-deleted parcels
 * Use this in all food_parcels queries to ensure soft-deleted parcels are excluded
 *
 * Example usage:
 * ```typescript
 * const parcels = await db
 *   .select()
 *   .from(foodParcels)
 *   .where(and(
 *     eq(foodParcels.household_id, householdId),
 *     notDeleted()  // Add this to filter soft-deleted parcels
 *   ))
 * ```
 */
export const notDeleted = () => isNull(foodParcels.deleted_at);

/**
 * Helper to create WHERE condition for finding deleted parcels
 * Use this when you specifically want to query soft-deleted parcels (admin/audit queries)
 */
export const isDeleted = () => isNotNull(foodParcels.deleted_at);
