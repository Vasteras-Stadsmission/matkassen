import { AuthProtection } from "@/components/AuthProtection";
import { ParcelThresholdSettings } from "./components/ParcelThresholdSettings";

export default async function ParcelSettingsPage() {
    return (
        <AuthProtection>
            <ParcelThresholdSettings />
        </AuthProtection>
    );
}
