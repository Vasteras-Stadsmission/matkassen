"use client";

import { useTranslations } from "next-intl";
import { formatDateWithLocalizedMonth } from "@/app/utils/date-utils";

interface LocalizedDateProps {
    date: Date;
    className?: string;
}

/**
 * Component to display a date with proper localization of month names
 */
export default function LocalizedDate({ date, className }: LocalizedDateProps) {
    const t = useTranslations("months");

    // Function to get the localized month name based on month index (0-11)
    const getLocalizedMonth = (monthIndex: number): string => {
        const monthNames = [
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        ] as const;

        // Use the correct month name as a key for translation with const assertion
        return t(monthNames[monthIndex]);
    };

    return (
        <span className={className}>{formatDateWithLocalizedMonth(date, getLocalizedMonth)}</span>
    );
}
