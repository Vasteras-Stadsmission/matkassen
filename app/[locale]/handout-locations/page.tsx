import { getLocale } from "next-intl/server";
import { redirect } from "@/app/i18n/navigation";

export default async function HandoutLocationsPage() {
    const locale = await getLocale();
    redirect({ href: "/settings/locations", locale });
}
