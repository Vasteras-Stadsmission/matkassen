import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Matkassen",
    description: "Food parcel handout administration app.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
