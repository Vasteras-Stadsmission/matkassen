import { Container, Skeleton, Stack, Card, Group } from "@mantine/core";

export default function HouseholdOptionsLoading() {
    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                {/* Header skeleton */}
                <Group justify="space-between">
                    <div>
                        <Skeleton height={32} width="250px" mb="xs" />
                        <Skeleton height={16} width="400px" />
                    </div>
                    <Skeleton height={36} width="100px" />
                </Group>

                {/* Tabs skeleton */}
                <Group gap="md">
                    <Skeleton height={36} width="140px" />
                    <Skeleton height={36} width="100px" />
                    <Skeleton height={36} width="130px" />
                </Group>

                {/* Info alert skeleton */}
                <Skeleton height={50} width="100%" />

                {/* Options list skeleton */}
                {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={index} shadow="sm" padding="md" withBorder>
                        <Group justify="space-between">
                            <Group gap="md">
                                <Skeleton height={20} width="150px" />
                                <Skeleton height={20} width="80px" />
                            </Group>
                            <Group gap="xs">
                                <Skeleton height={28} width={28} />
                                <Skeleton height={28} width={28} />
                            </Group>
                        </Group>
                    </Card>
                ))}
            </Stack>
        </Container>
    );
}
