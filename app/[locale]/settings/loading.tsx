import { Container, Skeleton, Stack } from "@mantine/core";

export default function SettingsLoading() {
    return (
        <Container size="md" py="xl">
            <Stack gap="md">
                {/* Page title skeleton */}
                <Skeleton height={40} width="40%" />

                {/* Description skeleton */}
                <Skeleton height={20} width="60%" />

                {/* Main content area skeleton */}
                <Skeleton height={300} />

                {/* Action buttons skeleton */}
                <Skeleton height={40} width="20%" />
            </Stack>
        </Container>
    );
}
