import { auth } from "@/auth";
import { UsersManager } from "./components/UsersManager";
import { getUsersWithStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
    const session = await auth();

    // Guard the data fetch: non-admins would be blocked by the layout's
    // AgreementProtection, but we still guard here to avoid a 500 from
    // the server action if the session hasn't loaded yet.
    if (session?.user?.role !== "admin") {
        return <div />;
    }

    const result = await getUsersWithStatus();

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return <UsersManager initialActive={result.data.active} initialFormer={result.data.former} />;
}
