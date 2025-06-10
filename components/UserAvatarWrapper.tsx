"use client";

import dynamic from "next/dynamic";

// Dynamically import the UserAvatar component with no SSR
const UserAvatar = dynamic(() => import("./UserAvatar"), {
    ssr: false,
    loading: () => (
        <div
            style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#f0f0f0" }}
        ></div>
    ),
});

export function UserAvatarWrapper() {
    return <UserAvatar />;
}
