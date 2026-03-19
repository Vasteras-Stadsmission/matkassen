"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, TextInput, Button, Stack, Text, Title, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { getUserProfile, saveUserProfile } from "@/app/utils/user-profile";

/**
 * Open the profile editor from anywhere by dispatching this event.
 * Used by AuthDropdown to let users edit their profile after initial completion.
 */
export const OPEN_PROFILE_EVENT = "open-profile-editor";

export function ProfileCompletionGuard() {
    const { status, update } = useSession();
    const t = useTranslations("profile");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");

    const loadAndOpen = useCallback(async () => {
        try {
            const result = await getUserProfile();
            if (result.success && result.data) {
                setFirstName(result.data.first_name || "");
                setLastName(result.data.last_name || "");
                setEmail(result.data.email || "");
                setPhone(result.data.phone || "");
                setIsEditing(result.data.profileComplete);
                setOpen(true);
            }
        } catch {
            // Silently fail - don't block the user
        }
    }, []);

    useEffect(() => {
        if (status !== "authenticated" || checked) return;

        async function checkProfile() {
            try {
                const result = await getUserProfile();
                if (result.success && result.data !== null && !result.data.profileComplete) {
                    setFirstName(result.data.first_name || "");
                    setLastName(result.data.last_name || "");
                    setEmail(result.data.email || "");
                    setPhone(result.data.phone || "");
                    setIsEditing(false);
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

    // Listen for external open requests (e.g. from AuthDropdown "Edit profile")
    useEffect(() => {
        function handleOpenEvent() {
            loadAndOpen();
        }
        window.addEventListener(OPEN_PROFILE_EVENT, handleOpenEvent);
        return () => window.removeEventListener(OPEN_PROFILE_EVENT, handleOpenEvent);
    }, [loadAndOpen]);

    const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

    function validationMessage(code: string, serverMessage: string): string {
        if (code === "VALIDATION_ERROR") {
            if (serverMessage.includes("phone")) return t("notifications.invalidPhone");
            if (serverMessage.includes("Invalid email")) return t("notifications.invalidEmail");
            if (serverMessage.includes("Email must")) return t("notifications.invalidEmail");
            if (serverMessage.includes("100")) return t("notifications.nameTooLong");
            if (serverMessage.includes("required")) return t("notifications.nameRequired");
        }
        return t("notifications.saveFailed");
    }

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
                // Refresh the session so the new name appears in the UI immediately
                await update();
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.saved"),
                    color: "green",
                });
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: validationMessage(result.error.code, result.error.message),
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

    // Forced mode: profile is incomplete, no escape (except logout)
    // Editing mode: user chose to edit, can close freely
    const canClose = isEditing;

    return (
        <Modal
            opened={open}
            onClose={() => canClose && setOpen(false)}
            withCloseButton={canClose}
            closeOnClickOutside={canClose}
            closeOnEscape={canClose}
            title={<Title order={3}>{t(isEditing ? "editProfile" : "completeProfile")}</Title>}
            size="md"
        >
            <form
                onSubmit={e => {
                    e.preventDefault();
                    handleSubmit();
                }}
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {t(isEditing ? "editProfileDescription" : "completeProfileDescription")}
                    </Text>

                    <TextInput
                        label={t("firstName")}
                        placeholder={t("firstNamePlaceholder")}
                        value={firstName}
                        onChange={e => setFirstName(e.currentTarget.value)}
                        maxLength={100}
                        required
                    />

                    <TextInput
                        label={t("lastName")}
                        placeholder={t("lastNamePlaceholder")}
                        value={lastName}
                        onChange={e => setLastName(e.currentTarget.value)}
                        maxLength={100}
                        required
                    />

                    <TextInput
                        label={t("email")}
                        placeholder={t("emailPlaceholder")}
                        value={email}
                        onChange={e => setEmail(e.currentTarget.value)}
                        maxLength={255}
                        type="email"
                    />

                    <TextInput
                        label={t("phone")}
                        placeholder={t("phonePlaceholder")}
                        value={phone}
                        onChange={e => setPhone(e.currentTarget.value)}
                        maxLength={50}
                        type="tel"
                    />

                    <Button type="submit" loading={loading} disabled={!canSubmit} fullWidth>
                        {t("save")}
                    </Button>

                    {!canClose && (
                        <Group justify="center">
                            <Button
                                variant="subtle"
                                color="dimmed"
                                size="xs"
                                type="button"
                                onClick={() => signOut({ callbackUrl: "/" })}
                            >
                                {t("logout")}
                            </Button>
                        </Group>
                    )}
                </Stack>
            </form>
        </Modal>
    );
}
