import { AuthProtection } from "@/components/AuthProtection";
import { EnrollmentChecklist } from "./components/EnrollmentChecklist";

export default async function GeneralSettingsPage() {
    return (
        <AuthProtection>
            <EnrollmentChecklist />
        </AuthProtection>
    );
}
