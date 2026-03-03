import { AgreementProtection } from "@/components/AgreementProtection";
import { UsersManager } from "./components/UsersManager";
import { getUsers } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
    const result = await getUsers();

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return (
        <AgreementProtection adminOnly>
            <UsersManager initialUsers={result.data} />
        </AgreementProtection>
    );
}
