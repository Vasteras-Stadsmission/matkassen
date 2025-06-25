import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
    // Redirect to the actual favicon location
    return Response.redirect(new URL("/favicon.svg", request.url), 301);
}
