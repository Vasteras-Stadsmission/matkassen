import RecipientsTable from "./components/RecipientsTable";
import { getRecipients } from "./actions";
import { Container, Title, Text, Space, Box } from "@mantine/core";

export default async function RecipientsPage() {
    const recipients = await getRecipients();

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="xs">
                Mottagare
            </Title>
            <Text c="dimmed" mb="xl">
                Hantera matkassens mottagare och deras information
            </Text>
            <Box>
                <RecipientsTable initialRecipients={recipients} />
            </Box>
        </Container>
    );
}
