import { Container, Skeleton, Stack, Card } from "@mantine/core";

export default function GeneralSettingsLoading() {
    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                {/* Header skeleton */}
                <div>
                    <Skeleton height={32} width="300px" mb="xs" />
                    <Skeleton height={16} width="500px" />
                </div>

                {/* Add button skeleton */}
                <Skeleton height={36} width="150px" />

                {/* Checklist items skeleton */}
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} shadow="sm" padding="md" withBorder>
                        <Stack gap="sm">
                            <Skeleton height={20} width="80%" />
                            <Skeleton height={14} width="60%" />
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <Skeleton height={20} width="80px" />
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <Skeleton height={30} width={30} />
                                    <Skeleton height={30} width={30} />
                                    <Skeleton height={30} width={30} />
                                </div>
                            </div>
                        </Stack>
                    </Card>
                ))}

                {/* Preview section skeleton */}
                <Card shadow="sm" padding="md" withBorder>
                    <Skeleton height={24} width="200px" mb="md" />
                    <Skeleton height={16} width="300px" mb="sm" />
                    {Array.from({ length: 2 }).map((_, index) => (
                        <div
                            key={index}
                            style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}
                        >
                            <Skeleton height={16} width={16} mr="sm" />
                            <Skeleton height={16} width="400px" />
                        </div>
                    ))}
                </Card>
            </Stack>
        </Container>
    );
}
