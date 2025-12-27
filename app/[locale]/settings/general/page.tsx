import { AuthProtection } from "@/components/AuthProtection";
import { EnrollmentChecklist } from "./components/EnrollmentChecklist";
import { PrivacyPolicyEditor } from "./components/PrivacyPolicyEditor";
import { Divider, Stack } from "@mantine/core";

export default async function GeneralSettingsPage() {
    return (
        <AuthProtection>
            <Stack gap="xl">
                <PrivacyPolicyEditor />
                <Divider />
                <EnrollmentChecklist />
            </Stack>
        </AuthProtection>
    );
}
