"use client";

import { useState, useTransition } from "react";
import { Container, Title, Text, Table, Avatar, Group, Select, Stack, Badge } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { updateUserRole, type UserRow, type UserRole } from "../actions";

interface UsersManagerProps {
    initialUsers: UserRow[];
}

export function UsersManager({ initialUsers }: UsersManagerProps) {
    const t = useTranslations("settings.usersSection");
    const { data: session } = useSession();
    const currentUsername = (session?.user as { githubUsername?: string })?.githubUsername;

    const [userList, setUserList] = useState<UserRow[]>(initialUsers);
    const [pending, startTransition] = useTransition();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    function errorMessage(code: string): string {
        if (code === "CANNOT_CHANGE_SELF_ROLE") return t("errors.cannotChangeSelfRole");
        if (code === "CANNOT_DEMOTE_LAST_ADMIN") return t("errors.cannotDemoteLastAdmin");
        return t("errors.updateFailed");
    }

    function handleRoleChange(userId: string, role: UserRole) {
        setLoadingId(userId);
        startTransition(async () => {
            const result = await updateUserRole(userId, role);
            setLoadingId(null);
            if (result.success) {
                setUserList(prev => prev.map(u => (u.id === userId ? { ...u, role } : u)));
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.roleUpdated"),
                    color: "green",
                });
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: errorMessage(result.error.code),
                    color: "red",
                });
            }
        });
    }

    const rows = userList.map(user => {
        const isSelf = user.github_username === currentUsername;
        const displayName = user.display_name || user.github_username;

        return (
            <Table.Tr key={user.id}>
                <Table.Td>
                    <Group gap="sm">
                        <Avatar src={user.avatar_url} size="sm" radius="xl" alt={displayName} />
                        <Stack gap={0}>
                            <Text size="sm" fw={500}>
                                {displayName}
                            </Text>
                            {user.display_name && (
                                <Text size="xs" c="dimmed">
                                    @{user.github_username}
                                </Text>
                            )}
                        </Stack>
                    </Group>
                </Table.Td>
                <Table.Td>
                    {isSelf ? (
                        <Badge variant="light" color={user.role === "admin" ? "blue" : "gray"}>
                            {t(`roles.${user.role}`)}
                        </Badge>
                    ) : (
                        <Select
                            size="xs"
                            value={user.role}
                            disabled={loadingId === user.id || pending}
                            data={[
                                { value: "admin", label: t("roles.admin") },
                                { value: "handout_staff", label: t("roles.handout_staff") },
                            ]}
                            onChange={value => {
                                if (value) handleRoleChange(user.id, value as UserRole);
                            }}
                            w={160}
                        />
                    )}
                </Table.Td>
            </Table.Tr>
        );
    });

    return (
        <Container size="sm" py="xl">
            <Stack gap="md">
                <div>
                    <Title order={2}>{t("title")}</Title>
                    <Text c="dimmed" size="sm">
                        {t("description")}
                    </Text>
                </div>
                <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t("columns.user")}</Table.Th>
                            <Table.Th>{t("columns.role")}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>
            </Stack>
        </Container>
    );
}
