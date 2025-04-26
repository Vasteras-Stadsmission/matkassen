import { handleSignOut } from "./HandleSignOut";
import { Button } from "@mantine/core";
import { useSession } from "next-auth/react";
import Link from "next/link";

export function AuthButton() {
    const { status } = useSession();

    if (status === "loading") {
        return <Button disabled>...</Button>;
    }

    if (status === "authenticated") {
        return (
            <form action={handleSignOut}>
                <Button type="submit">Logga ut</Button>
            </form>
        );
    }

    return (
        <Button component={Link} href="/api/auth/signin">
            Logga in
        </Button>
    );
}
