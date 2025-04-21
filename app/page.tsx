"use client";

import { useSession } from "next-auth/react";
import { Container, Title, Text, Button, Group, Card } from "@mantine/core";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

function HomeContent() {
    const { data: session, status } = useSession();
    const router = useRouter();

    return (
        <Container size="lg" py="xl">
            <Card withBorder shadow="sm" radius="md" p="xl" mb="xl">
                <Title order={1} mb="md">
                    Welcome to Matkassen
                </Title>

                <Text size="lg" mb="xl">
                    Administration system for food parcel distribution
                </Text>

                <Text mb="md">
                    Authentication status: <strong>{status}</strong>
                </Text>

                {session ? (
                    <div>
                        <Text mb="xl">
                            You're signed in as:{" "}
                            <strong>{session.user?.name || session.user?.email}</strong>
                        </Text>

                        <Group>
                            <Button onClick={() => router.push("/create-recipient")}>
                                Create new recipient
                            </Button>
                            <Button onClick={() => router.push("/recipients")} variant="outline">
                                View all recipients
                            </Button>
                        </Group>
                    </div>
                ) : (
                    <Text>Please sign in to access the application features.</Text>
                )}
            </Card>
        </Container>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HomeContent />
        </Suspense>
    );
}
