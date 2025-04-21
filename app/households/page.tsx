import HouseholdsTable from "./components/HouseholdsTable";
import { getHouseholds } from "./actions";
import { Container, Title, Text, Space, Box } from "@mantine/core";

export default async function HouseholdsPage() {
    const households = await getHouseholds();

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="xs">
                Hushåll
            </Title>
            <Text c="dimmed" mb="xl">
                Hantera matkassens hushåll och deras information
            </Text>
            <Box>
                <HouseholdsTable initialHouseholds={households} />
            </Box>
        </Container>
    );
}