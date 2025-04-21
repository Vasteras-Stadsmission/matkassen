"use client";

import { useSession } from "next-auth/react";
import { Avatar } from "@mantine/core";

export default function UserAvatar() {
    const { data: session } = useSession();

    if (!session?.user) return null;

    return <Avatar src={session.user.image ?? undefined} alt="User Avatar" size="md" radius="xl" />;
}
