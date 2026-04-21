import type { useTranslations } from "next-intl";
import type { ManualSlug } from "./manual-registry";

/**
 * Map manual slugs to static i18n keys so the next-intl TypeScript check
 * can verify every key exists in `messages/en.json`. Adding a new manual
 * requires updating this file AND the JSON — a deliberate friction point
 * that keeps the registry and translations in sync.
 */

type HelpTranslator = ReturnType<typeof useTranslations<"help">>;

export function getManualTitle(t: HelpTranslator, slug: ManualSlug): string {
    switch (slug) {
        case "overview":
            return t("manuals.overview.title");
        case "handout-staff":
            return t("manuals.handoutStaff.title");
        case "case-worker":
            return t("manuals.caseWorker.title");
        case "administrator":
            return t("manuals.admin.title");
    }
}

export function getManualDescription(t: HelpTranslator, slug: ManualSlug): string {
    switch (slug) {
        case "overview":
            return t("manuals.overview.description");
        case "handout-staff":
            return t("manuals.handoutStaff.description");
        case "case-worker":
            return t("manuals.caseWorker.description");
        case "administrator":
            return t("manuals.admin.description");
    }
}
