"use client";

import dynamic from "next/dynamic";

// Dynamically import the UserAvatar component with no SSR
// Using a named import since UserAvatar is a default export
const UserAvatar = dynamic(() => import("./UserAvatar").then(mod => ({ default: mod.default })), {
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
