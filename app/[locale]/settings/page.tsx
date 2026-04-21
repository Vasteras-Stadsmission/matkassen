import { redirect } from "@/app/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function SettingsPage() {
    const locale = await getLocale();
    redirect({ href: "/settings/locations", locale });
}
