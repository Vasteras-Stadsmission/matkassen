import { auth } from "../auth";
import { Avatar } from "@mantine/core";

export default async function UserAvatar() {
    const session = await auth();

    if (!session?.user) return null;

    return <Avatar src={session.user.image ?? undefined} alt="User Avatar" size="md" radius="xl" />;
}
