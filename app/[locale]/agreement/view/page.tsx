import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { AgreementViewClient } from "./AgreementViewClient";

type Params = {
    locale: string;
};

/**
 * Read-only view of the current user agreement.
 * Accessible from the user dropdown menu so users can review the agreement at any time (GDPR requirement).
 */
export default async function AgreementViewPage({ params }: { params: Params | Promise<Params> }) {
    const session = await auth();
    const { locale } = await params;

    if (!session) {
        redirect({
            href: "/auth/signin",
            locale,
        });
    }

    return <AgreementViewClient />;
}
