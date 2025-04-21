"use client";

import { Suspense } from "react";
import { Button } from "@mantine/core";
import { useRouter } from "next/navigation";

function NotFoundContent() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="mb-6">The page you are looking for does not exist.</p>
      <Button onClick={() => router.push("/")}>Return to Home</Button>
    </div>
  );
}

export default function NotFoundPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NotFoundContent />
    </Suspense>
  );
}