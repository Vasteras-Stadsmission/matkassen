import { AgreementProtection } from "@/components/AgreementProtection";
import { SettingsPageClient } from "./components/SettingsPageClient";

export default async function GeneralSettingsPage() {
    return (
        <AgreementProtection>
            <SettingsPageClient />
        </AgreementProtection>
    );
}
