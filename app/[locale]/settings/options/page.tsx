import { AuthProtection } from "@/components/AuthProtection";
import { HouseholdOptionsManager } from "./components/HouseholdOptionsManager";

export default async function HouseholdOptionsPage() {
    return (
        <AuthProtection>
            <HouseholdOptionsManager />
        </AuthProtection>
    );
}
