import { handlers } from "@/auth";
export const { GET, POST } = handlers;
// Remove Edge runtime to use default Node.js runtime instead
// This fixes the "TypeError: immutable" error during OAuth callbacks
