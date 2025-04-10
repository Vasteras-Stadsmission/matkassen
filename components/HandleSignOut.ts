"use server";

import { signOut } from "@/auth";
import { redirect } from "next/navigation";

export async function handleSignOut() {
    // First, sign out from the application
    await signOut({ redirect: false });

    // Redirect to GitHub's logout page
    redirect("https://github.com/logout");
}
