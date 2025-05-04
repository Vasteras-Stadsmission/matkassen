import { redirect } from "@/app/i18n/navigation";
import { routing } from "./i18n/routing";

export default function RootPage() {
    // Redirect to the default locale when accessing the root path
    redirect({
        href: "/",
        locale: routing.defaultLocale,
    });
}
