import { AgreementProtection } from "@/components/AgreementProtection";
import { StatisticsClient } from "./components/StatisticsClient";

export default async function StatisticsPage() {
    return (
        <AgreementProtection>
            <StatisticsClient />
        </AgreementProtection>
    );
}
