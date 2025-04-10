import { handleSignOut } from "./HandleSignOut";
import { Button } from "@mantine/core";

export function SignOutButton() {
    return (
        <form action={handleSignOut}>
            <Button type="submit">Sign out</Button>
        </form>
    );
}
