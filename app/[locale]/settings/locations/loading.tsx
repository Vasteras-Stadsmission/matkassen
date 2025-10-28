import { Container, Skeleton, Stack, Card, Group } from "@mantine/core";

export default function LocationSettingsLoading() {
    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                {/* Header skeleton */}
                <div>
                    <Skeleton height={32} width="300px" mb="xs" />
                    <Skeleton height={16} width="500px" />
                </div>

                {/* Add location button skeleton */}
                <Group justify="flex-end">
                    <Skeleton height={36} width="150px" />
                </Group>

                {/* Location cards skeleton */}
                {Array.from({ length: 2 }).map((_, index) => (
                    <Card key={index} shadow="sm" padding="lg" withBorder>
                        <Stack gap="md">
                            {/* Location header */}
                            <Group justify="space-between" align="center">
                                <div>
                                    <Skeleton height={24} width="200px" mb="xs" />
                                    <Skeleton height={16} width="300px" />
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <Skeleton height={30} width={30} />
                                    <Skeleton height={30} width={30} />
                                </div>
                            </Group>

                            {/* Location details */}
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                                    gap: "16px",
                                }}
                            >
                                <div>
                                    <Skeleton height={16} width="80px" mb="xs" />
                                    <Skeleton height={16} width="150px" />
                                </div>
                                <div>
                                    <Skeleton height={16} width="80px" mb="xs" />
                                    <Skeleton height={16} width="120px" />
                                </div>
                                <div>
                                    <Skeleton height={16} width="80px" mb="xs" />
                                    <Skeleton height={16} width="100px" />
                                </div>
                            </div>

                            {/* Schedules section */}
                            <div>
                                <Skeleton height={20} width="150px" mb="md" />
                                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                    {Array.from({ length: 3 }).map((_, scheduleIndex) => (
                                        <div key={scheduleIndex}>
                                            <Skeleton height={16} width="100px" mb="xs" />
                                            <Skeleton height={16} width="80px" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Stack>
                    </Card>
                ))}
            </Stack>
        </Container>
    );
}
