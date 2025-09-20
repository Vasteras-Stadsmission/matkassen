import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { getTranslations } from "next-intl/server";
import SmsManagementDemo from "./components/SmsManagementDemo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "common" });
    return {
        title: `SMS Management Demo - ${t("matkassen")}`,
    };
}

export default async function SmsManagementPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const session = await auth();
    if (!session) {
        redirect({ href: "/auth/signin", locale });
    }

    return (
        <main style={{ padding: "2rem" }}>
            <Suspense fallback={<div>Loading...</div>}>
                <SmsManagementDemo />
            </Suspense>
        </main>
    );
}
