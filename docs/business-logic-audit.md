# Business Logic Audit

This is a living maintenance plan for reviewing Matkassen's business logic. The goal is to keep the codebase simple, readable, and easy to change for a one-person project.

## Goals

- Find and remove dead or obsolete business logic.
- Reduce duplicated domain rules when a shared helper would make behavior clearer.
- Simplify code that is more abstract than the problem requires.
- Keep behavior aligned with code, tests, and production expectations.
- Make small, validated changes instead of broad refactors.

## Non-Goals

- Large architecture redesigns.
- Cosmetic-only rewrites.
- Changing product behavior without an explicit decision.
- Moving logic into shared helpers when local duplication is clearer.
- Expanding public/user documentation as part of the audit.

## Working Principles

- Audit one domain at a time.
- Start each audit pass by looking for code that can be deleted or made less configurable.
- Prefer deleting code over reshaping it when code is truly unused.
- Treat optional props, mode flags, status branches, feature toggles, and generic helpers with suspicion until their real call sites prove they are needed.
- Prefer boring named helpers for repeated business rules.
- Keep one-off logic close to the feature that owns it.
- Preserve existing security patterns: server actions use `protectedAction()`, and admin API routes use `authenticateAdminRequest()`.
- Preserve i18n for all user-facing text.
- Run focused tests or `pnpm run validate` after meaningful changes.

## Deletion-First Search Checklist

Before adding abstractions or centralizing rules, actively search for simplifications in the current audit area:

1. Find optional props, mode flags, and booleans that are always passed the same way.
2. Find status branches that no real production path can reach.
3. Find components that support multiple layouts when only one layout is used.
4. Find helpers with one meaningful caller, especially when the helper hides simple local logic.
5. Find stale i18n keys, labels, or comments tied to removed states.
6. Find tests or mocks that preserve an old API after production code stopped needing it.
7. Find duplicated UI states where one state is just an older spelling of another.

Useful searches:

```bash
rg -n "is[A-Z]|mode|variant|compact|status|type|TODO|deprecated|legacy" app components __tests__ messages
rg -n "noShow|pickedUp|cancelled|deletedAt|archived|outsideHours" app __tests__
rg -n "export function|export const|interface .*Props|type .*Props" app components
```

For each suspicious branch, verify all call sites with `rg` before editing. If all production call sites use the same path, prefer removing the option over preserving a dormant API.

## Audit Areas

| Area                                          | Focus                                                                                             | Status      | Notes                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parcel status and pickup rules                | Date-only status logic, picked-up/not-picked-up transitions, public and admin display consistency | In progress | Admin household status follows date-only display; pickup/no-show mutations are centralized. Public parcel status intentionally uses pickup-window/expiry semantics and now has focused tests. |
| Household management                          | Household actions, eligibility, member/contact fields, deletion/archive behavior                  | Not started |                                                                                                                                                                                               |
| Scheduling                                    | Parcel scheduling, calendar/date handling, pickup windows, recurring assumptions                  | In progress | Weekly grid now has one production outside-hours data path; schedule parcel mapping is being consolidated to reduce drift.                                                                    |
| Handout locations                             | Location availability, assignment rules, related parcel constraints                               | Not started |                                                                                                                                                                                               |
| SMS queue and notifications                   | Queue state transitions, retry behavior, scheduler assumptions, message generation                | Not started |                                                                                                                                                                                               |
| Verification questions and public parcel flow | Public page rules, verification state, QR/parcel access behavior                                  | Not started |                                                                                                                                                                                               |
| Statistics and reporting                      | Query duplication, derived metrics, filters, date ranges                                          | Not started |                                                                                                                                                                                               |
| Auth, roles, and user agreement               | Admin/staff role checks, agreement gates, protected UI assumptions                                | Not started | Keep security-sensitive cleanup conservative.                                                                                                                                                 |
| i18n-related domain text                      | Message key duplication, dead messages tied to removed flows                                      | Not started | Do this after domain cleanup to avoid churn.                                                                                                                                                  |

## Finding Categories

| Category           | Meaning                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Dead code          | Unused functions, unreachable branches, obsolete feature remnants, unused message keys tied to removed logic. |
| Duplicated rule    | The same business rule exists in multiple places and could drift.                                             |
| Over-abstraction   | A helper/component/module makes a simple rule harder to read or change.                                       |
| Under-abstraction  | Repeated logic would be safer and clearer as a shared domain helper.                                          |
| Behavior ambiguity | Code, docs, tests, or UI imply different business behavior.                                                   |
| Test gap           | Important business behavior lacks a focused test.                                                             |

## Findings

| Date       | Area                           | Category           | Finding                                                                                                                                                                                                                                                                                                                        | Recommendation                                                                                                                                           | Status    |
| ---------- | ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2026-06-17 | Parcel status and pickup rules | Behavior ambiguity | Admin parcel badges are date-only (`upcoming`, `not picked up`, `picked up`), while public `/p/[parcelId]` uses recipient-facing pickup-window states (`scheduled`, `ready`, `expired`, `collected`, `cancelled`). The difference is intentional, but it had little direct test coverage and was easy to miss from code alone. | Keep the split behavior, explain it near the public status calculation, and pin public status semantics with focused tests.                              | Addressed |
| 2026-06-17 | Parcel status and pickup rules | Duplicated rule    | Admin status display is calculated locally in multiple UI surfaces: household parcel list, today handouts, weekly schedule cards, and parcel admin dialog. The core order is similar, but each surface uses its own labels and emphasis.                                                                                       | Do not centralize yet; the contexts differ enough that local rules are still readable. Revisit only if another status state is added or drift continues. | Accepted  |
| 2026-06-17 | Parcel status and pickup rules | Behavior ambiguity | Weekly schedule `PickupCard` accepted `noShowAt` but displayed any non-picked-up parcel as “not handed out” in the tooltip and colored it as past/upcoming rather than explicit no-show. Other admin surfaces show no-show as its own status.                                                                                  | Show explicit no-show label/color in `PickupCard` using existing schedule i18n.                                                                          | Addressed |
| 2026-06-18 | Parcel status and pickup rules | Dead code          | `PickupCard` exposed an `isCompact` option, but all production call sites used compact mode: time-slot cells, weekly grid cells, outside-hours parcels, and drag overlays. The non-compact branch was effectively unused.                                                                                                      | Remove the option and make the compact card the only implementation.                                                                                     | Addressed |
| 2026-06-18 | Scheduling                     | Dead code          | `SchedulePageClient` was a 615-line legacy schedule page implementation with no imports or route references. It kept an older weekly-grid call path alive, including the optional client-side outside-hours fallback in `WeeklyScheduleGrid`.                                                                                  | Delete the unused component and make `WeeklyScheduleGrid` receive outside-hours parcels through its only production caller.                              | Addressed |
| 2026-06-19 | Scheduling                     | Duplicated rule    | Schedule server actions repeatedly mapped database rows into the shared `FoodParcel` UI shape. This is the drift point that previously let weekly parcels omit `noShowAt`, and outside-hours parcels had their own terminal-state assumptions.                                                                                 | Use one local mapper for schedule `FoodParcel` results and exclude no-show parcels from outside-hours cleanup results.                                   | Addressed |
| 2026-06-19 | Scheduling                     | Dead code          | `user-preferences.ts` still exported deprecated preferred-location aliases plus a debug-only `getCurrentUser` action. Production code used the favorite-location names directly, and only a test referenced the debug action.                                                                                                  | Remove the stale exports and the test preserving the unused debug API.                                                                                   | Addressed |
| 2026-06-17 | Parcel status and pickup rules | Test gap           | Public parcel status logic had tests for admin URL generation but not for cancelled/collected/window/expired state precedence.                                                                                                                                                                                                 | Add focused unit coverage for `getParcelStatus()`.                                                                                                       | Addressed |

## Decisions

| Date       | Decision                                                      | Reason                                                                                                                           |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-17 | Track the business-logic cleanup in this repo.                | The audit is tied to this codebase and should survive Codex restarts, branches, and future maintenance work.                     |
| 2026-06-17 | Install general Next.js guidance globally, not project-local. | `next-best-practices` is framework guidance, while Matkassen-specific audit state belongs in the repo.                           |
| 2026-06-17 | Deprecate broad business-logic prose as source of truth.      | Durable rules should live in clear code, focused tests, and short comments near surprising behavior; broad prose docs can drift. |

## Completed Changes

| Date       | Area                           | Summary                                                                                                                                                                                                                                       | Validation                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-17 | Parcel status and pickup rules | Updated weekly schedule pickup cards to show explicit no-show status, removed the unused non-compact `PickupCard` branch, documented the public/admin status split near public status code, and added direct card/public parcel status tests. | `pnpm vitest run __tests__/app/schedule/components/PickupCard.test.tsx __tests__/app/schedule/components/TimeSlotCell.test.tsx __tests__/app/utils/public-parcel-data.test.ts __tests__/app/households/parcel-status-display.test.ts`; `pnpm run validate`                                                        |
| 2026-06-18 | Scheduling                     | Deleted the unused legacy `SchedulePageClient` and removed the optional client-side outside-hours fallback from `WeeklyScheduleGrid`; the grid now has one production data path through the location-specific weekly page.                    | `pnpm vitest run __tests__/app/schedule/components/WeeklyScheduleGrid.test.tsx __tests__/app/schedule/components/TimeSlotGeneration.test.ts __tests__/integration/schedule/outside-hours-parcels.integration.test.ts __tests__/integration/schedule/outside-hours-count.integration.test.ts`; `pnpm run validate` |
| 2026-06-19 | Scheduling                     | Consolidated repeated schedule `FoodParcel` mapping, excluded no-show parcels from outside-hours cleanup results, and removed unused preferred-location/debug user-preference exports.                                                        | `pnpm vitest run __tests__/integration/schedule/weekly-parcels.integration.test.ts __tests__/integration/schedule/outside-hours-parcels.integration.test.ts __tests__/integration/households/primary-location.integration.test.ts __tests__/app/utils/auth/username-tracking.test.ts`; `pnpm run validate`        |

## Resume Instructions

When continuing this work in a new Codex session:

1. Read `AGENTS.md`.
2. Read `docs/business-logic-audit.md`.
3. Treat code and tests as the source of truth; use prose docs only as historical context until `docs/business-logic.md` is deprecated or removed.
4. Pick one audit area and inspect existing code/tests before making changes.
5. Update this document with findings, decisions, and completed changes.
