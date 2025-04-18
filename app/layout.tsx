import type { Metadata } from "next";
import "@mantine/core/styles.css";

export const metadata: Metadata = {
    title: "Matkassen",
    description: "Food parcel handout administration app.",
    icons: {
        icon: "/favicon.svg",
    },
};

import { RootLayoutClient } from "./layout.client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return <RootLayoutClient>{children}</RootLayoutClient>;
}
