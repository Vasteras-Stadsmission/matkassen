"use client";

import { useSession } from "next-auth/react";
import { Container, Title, Text, Card } from "@mantine/core";
import { Suspense } from "react";

function HomeContent() {
    const { data: session, status } = useSession();

    return (
        <Container size="lg" py="xl">
            <Card withBorder shadow="sm" radius="md" p="xl" mb="xl">
                <Title order={1} mb="md">
                    Välkommen till Matkassen
                </Title>

                <Text size="lg" mb="xl">
                    Administrationssystem för distribution av matkassar
                </Text>

                <Text mb="md">
                    Autentiseringsstatus: <strong>{status}</strong>
                </Text>

                {session ? (
                    <div>
                        <Text mb="xl">
                            Du är inloggad som:{" "}
                            <strong>{session.user?.name || session.user?.email}</strong>
                        </Text>
                    </div>
                ) : (
                    <Text>Logga in för att få tillgång till applikationens funktioner.</Text>
                )}
            </Card>
        </Container>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<div>Laddar...</div>}>
            <HomeContent />
        </Suspense>
    );
}
