"use client";

import {
    Button,
    Title,
    Text,
    Card,
    NumberInput,
    SegmentedControl,
    ActionIcon,
    List,
    Box,
    Paper,
    Alert,
    Flex,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconTrash, IconUserPlus, IconInfoCircle } from "@tabler/icons-react";
import { HouseholdMember } from "../types";

interface MembersFormProps {
    data: HouseholdMember[];
    updateData: (data: HouseholdMember[]) => void;
}

export default function MembersForm({ data, updateData }: MembersFormProps) {
    // Initialize with data from parent, this makes members persist when navigating back
    const addMemberForm = useForm({
        initialValues: {
            age: "",
            sex: "male",
        },
        validate: {
            age: value => (value === "" || Number(value) < 0 ? "Ålder måste anges" : null),
            sex: value => (!value ? "Välj kön" : null),
        },
    });

    const addMember = (values: { age: string | number; sex: string }) => {
        const newMember: HouseholdMember = {
            id: nanoid(8),
            age: Number(values.age),
            sex: values.sex,
        };

        const updatedMembers = [...data, newMember];
        updateData(updatedMembers);
        addMemberForm.reset();
        // Reset to default value after adding a member
        addMemberForm.setFieldValue("sex", "male");
    };

    const removeMember = (index: number) => {
        const updatedMembers = data.filter((_, i) => i !== index);
        updateData(updatedMembers);
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Medlemmar i hushållet
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                Lägg till alla medlemmar i hushållet. Dessa uppgifter används för att beräkna
                matmängd och särskilda behov.
            </Text>

            {data.length === 0 && (
                <Alert
                    icon={<IconInfoCircle size="1rem" />}
                    title="Inga medlemmar har lagts till än"
                    color="blue"
                    mb="md"
                >
                    Fyll i åldern och välj kön för varje hushållsmedlem och klicka sedan på
                    &quot;Lägg till person&quot; för att lägga till dem i listan.
                </Alert>
            )}

            {data.length > 0 && (
                <Box mb="md">
                    <Title order={5} mb="xs">
                        Registrerade medlemmar:
                    </Title>
                    <Paper withBorder p="sm" radius="md">
                        <List spacing="xs">
                            {data.map((member, index) => (
                                <List.Item
                                    key={member.id || index}
                                    icon={
                                        <ActionIcon
                                            color="red"
                                            onClick={() => removeMember(index)}
                                            size="sm"
                                        >
                                            <IconTrash size="1rem" />
                                        </ActionIcon>
                                    }
                                >
                                    <Text>
                                        {member.age} år,{" "}
                                        {member.sex === "male"
                                            ? "Man"
                                            : member.sex === "female"
                                              ? "Kvinna"
                                              : "Annat"}
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    </Paper>
                </Box>
            )}

            <form onSubmit={addMemberForm.onSubmit(addMember)}>
                <Paper p="md" withBorder radius="md" shadow="xs">
                    <Title order={6} mb="md">
                        Lägg till en person
                    </Title>

                    <Flex align="flex-end" gap="md" wrap="wrap">
                        <Box>
                            <NumberInput
                                label="Ålder"
                                placeholder="Ålder"
                                withAsterisk
                                min={0}
                                max={120}
                                {...addMemberForm.getInputProps("age")}
                                styles={{ wrapper: { width: "120px" } }}
                            />
                        </Box>

                        <Box>
                            <Text fw={500} size="sm" mb={7}>
                                Kön <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                            </Text>
                            <SegmentedControl
                                data={[
                                    { value: "male", label: "Man" },
                                    { value: "female", label: "Kvinna" },
                                    { value: "other", label: "Annat" },
                                ]}
                                {...addMemberForm.getInputProps("sex")}
                            />
                        </Box>

                        <Button
                            type="submit"
                            variant="light"
                            color="teal"
                            leftSection={<IconUserPlus size="1rem" />}
                            ml="auto"
                        >
                            Lägg till person
                        </Button>
                    </Flex>
                </Paper>
            </form>
        </Card>
    );
}
