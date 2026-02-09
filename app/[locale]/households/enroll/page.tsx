import { AgreementProtection } from "@/components/AgreementProtection";
import { EnrollClient } from "./EnrollClient";

export default function EnrollHouseholdPage() {
    return (
        <AgreementProtection>
            <EnrollClient />
        </AgreementProtection>
    );
}
