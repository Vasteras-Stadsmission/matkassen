import { AuthProtection } from "@/components/AuthProtection";
import { SettingsPageClient } from "./components/SettingsPageClient";

export default async function GeneralSettingsPage() {
    return (
        <AuthProtection>
            <SettingsPageClient />
        </AuthProtection>
    );
}
