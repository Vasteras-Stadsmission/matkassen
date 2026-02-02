import { AgreementProtection } from "@/components/AgreementProtection";
import { ParcelThresholdSettings } from "./components/ParcelThresholdSettings";

export default async function ParcelSettingsPage() {
    return (
        <AgreementProtection>
            <ParcelThresholdSettings />
        </AgreementProtection>
    );
}
