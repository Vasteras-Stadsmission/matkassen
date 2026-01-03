import { AuthProtection } from "@/components/AuthProtection";
import { StatisticsClient } from "./components/StatisticsClient";

export default async function StatisticsPage() {
    return (
        <AuthProtection>
            <StatisticsClient />
        </AuthProtection>
    );
}
