import { headers } from "next/headers";

/**
 * Get the CSP nonce from request headers.
 * This nonce should be used for inline scripts to satisfy Content Security Policy.
 *
 * @returns The nonce string or undefined if not available
 */
export async function getNonce(): Promise<string | undefined> {
    const headersList = await headers();
    return headersList.get("x-nonce") || undefined;
}

/**
 * Hook for client components to access the nonce.
 * Note: This should be passed down from server components since
 * client components can't directly access server-side headers.
 */
export interface NonceContextValue {
    nonce?: string;
}
