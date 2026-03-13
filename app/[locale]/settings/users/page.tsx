import { auth } from "@/auth";
import { AgreementProtection } from "@/components/AgreementProtection";
import { UsersManager } from "./components/UsersManager";
import { getUsersWithStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
    const session = await auth();

    // Guard the data fetch: non-admins let AgreementProtection render the
    // access-denied screen without throwing a 500 from the server action.
    if (session?.user?.role !== "admin") {
        return (
            <AgreementProtection adminOnly>
                <div />
            </AgreementProtection>
        );
    }

    const result = await getUsersWithStatus();

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return (
        <AgreementProtection adminOnly>
            <UsersManager initialActive={result.data.active} initialFormer={result.data.former} />
        </AgreementProtection>
    );
}
