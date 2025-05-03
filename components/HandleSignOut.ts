"use server";

import { signOut } from "next-auth/react";
import { redirect } from "@/app/i18n/navigation";

export async function handleSignOut() {
    await signOut();
    redirect({ href: "/", locale: "en" });
}
