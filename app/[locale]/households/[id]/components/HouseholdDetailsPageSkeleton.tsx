import { Container, Stack, Box, Group, SimpleGrid, Paper, Skeleton } from "@mantine/core";

export function HouseholdDetailsPageSkeleton() {
    return (
        <Container size="xl" py="xl">
            {/* Header */}
            <Stack gap="lg" mb="xl">
                <Group justify="space-between" align="flex-start">
                    <Box style={{ flex: 1 }}>
                        <Skeleton height={40} width={120} mb="sm" />
                        <Skeleton height={36} width={250} />
                    </Box>
                    <Group>
                        <Skeleton height={36} width={150} />
                        <Skeleton height={36} width={160} />
                    </Group>
                </Group>
            </Stack>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                {/* Left Column - Household Info */}
                <Stack gap="md">
                    {/* Basic Info */}
                    <Paper withBorder p="lg" radius="md">
                        <Skeleton height={28} width={100} mb="md" />
                        <Stack gap="sm">
                            {[1, 2, 3, 4].map(i => (
                                <Group gap="sm" key={i}>
                                    <Skeleton height={40} width={40} radius="md" />
                                    <Skeleton height={20} width={180} />
                                </Group>
                            ))}
                        </Stack>
                    </Paper>

                    {/* Members */}
                    <Paper withBorder p="lg" radius="md">
                        <Skeleton height={28} width={150} mb="md" />
                        <Group gap="sm">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} height={60} width={100} radius="md" />
                            ))}
                        </Group>
                    </Paper>

                    {/* Additional Cards */}
                    <Paper withBorder p="lg" radius="md">
                        <Skeleton height={28} width={120} mb="md" />
                        <Group gap="xs">
                            {[1, 2].map(i => (
                                <Skeleton key={i} height={32} width={100} radius="xl" />
                            ))}
                        </Group>
                    </Paper>

                    {/* Comments */}
                    <Paper withBorder p="lg" radius="md">
                        <Skeleton height={28} width={140} mb="md" />
                        <Stack gap="md">
                            <Skeleton height={80} radius="md" />
                            <Skeleton height={100} radius="md" />
                        </Stack>
                    </Paper>
                </Stack>

                {/* Right Column - Parcels */}
                <Stack gap="md">
                    <Paper withBorder p="lg" radius="md">
                        <Group justify="space-between" mb="md">
                            <Skeleton height={28} width={150} />
                            <Skeleton height={24} width={120} />
                        </Group>
                        <Stack gap="sm">
                            {[1, 2, 3].map(i => (
                                <Paper key={i} withBorder p="md" radius="md">
                                    <Group justify="space-between" wrap="nowrap">
                                        <Stack gap="xs" style={{ flex: 1 }}>
                                            <Group gap="xs">
                                                <Skeleton height={36} width={36} radius="md" />
                                                <Box>
                                                    <Skeleton height={16} width={100} mb={4} />
                                                    <Skeleton height={14} width={120} />
                                                </Box>
                                            </Group>
                                            <Group gap="xs">
                                                <Skeleton height={36} width={36} radius="md" />
                                                <Skeleton height={16} width={120} />
                                            </Group>
                                        </Stack>
                                        <Skeleton height={32} width={80} radius="xl" />
                                    </Group>
                                </Paper>
                            ))}
                        </Stack>
                    </Paper>
                </Stack>
            </SimpleGrid>
        </Container>
    );
}
