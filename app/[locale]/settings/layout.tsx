import { AgreementProtection } from "@/components/AgreementProtection";
import { SettingsShell } from "./components/SettingsShell";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <AgreementProtection adminOnly>
            <SettingsShell>{children}</SettingsShell>
        </AgreementProtection>
    );
}
