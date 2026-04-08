import { redirect } from "@/app/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function ParcelsSettingsRedirect() {
    const locale = await getLocale();
    redirect({ href: "/settings/parcel-limits", locale });
}
