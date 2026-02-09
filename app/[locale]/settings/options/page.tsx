import { AgreementProtection } from "@/components/AgreementProtection";
import { HouseholdOptionsManager } from "./components/HouseholdOptionsManager";

export default async function HouseholdOptionsPage() {
    return (
        <AgreementProtection>
            <HouseholdOptionsManager />
        </AgreementProtection>
    );
}
