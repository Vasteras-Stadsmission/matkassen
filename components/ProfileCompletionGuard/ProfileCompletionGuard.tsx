"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { getUserProfile, saveUserProfile } from "@/app/utils/user-profile";

export function ProfileCompletionGuard() {
    const { data: session, status } = useSession();
    const t = useTranslations("profile");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");

    useEffect(() => {
        if (status !== "authenticated" || checked) return;

        async function checkProfile() {
            try {
                const result = await getUserProfile();
                if (result.success && result.data && !result.data.profileComplete) {
                    // Pre-fill any existing values
                    setFirstName(result.data.first_name || "");
                    setLastName(result.data.last_name || "");
                    setEmail(result.data.email || "");
                    setPhone(result.data.phone || "");
                    setOpen(true);
                }
            } catch {
                // Silently fail - don't block the user
            } finally {
                setChecked(true);
            }
        }

        checkProfile();
    }, [status, checked]);

    const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        try {
            const result = await saveUserProfile({
                first_name: firstName,
                last_name: lastName,
                email: email || undefined,
                phone: phone || undefined,
            });
            if (result.success) {
                setOpen(false);
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.saved"),
                    color: "green",
                });
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: result.error.message,
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.saveFailed"),
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            opened={open}
            onClose={() => {}}
            withCloseButton={false}
            closeOnClickOutside={false}
            closeOnEscape={false}
            title={<Title order={3}>{t("completeProfile")}</Title>}
            size="md"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {t("completeProfileDescription")}
                </Text>

                <TextInput
                    label={t("firstName")}
                    placeholder={t("firstNamePlaceholder")}
                    value={firstName}
                    onChange={e => setFirstName(e.currentTarget.value)}
                    required
                />

                <TextInput
                    label={t("lastName")}
                    placeholder={t("lastNamePlaceholder")}
                    value={lastName}
                    onChange={e => setLastName(e.currentTarget.value)}
                    required
                />

                <TextInput
                    label={t("email")}
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={e => setEmail(e.currentTarget.value)}
                    type="email"
                />

                <TextInput
                    label={t("phone")}
                    placeholder={t("phonePlaceholder")}
                    value={phone}
                    onChange={e => setPhone(e.currentTarget.value)}
                    type="tel"
                />

                <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit} fullWidth>
                    {t("save")}
                </Button>
            </Stack>
        </Modal>
    );
}
