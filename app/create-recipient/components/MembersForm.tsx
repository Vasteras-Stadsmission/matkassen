"use client";

import { useState } from "react";
import {
    TextInput,
    SimpleGrid,
    Group,
    Button,
    Title,
    Text,
    Card,
    NumberInput,
    Select,
    ActionIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconTrash } from "@tabler/icons-react";

interface HouseholdMember {
    id?: string;
    age: number;
    sex: string;
}

interface MembersFormProps {
    data: HouseholdMember[];
    updateData: (data: HouseholdMember[]) => void;
}

export default function MembersForm({ data, updateData }: MembersFormProps) {
    const [members, setMembers] = useState<HouseholdMember[]>(data || []);

    const addMemberForm = useForm({
        initialValues: {
            age: "",
            sex: "",
        },
        validate: {
            age: value => (value === "" || value < 0 ? "Ålder måste anges" : null),
            sex: value => (!value ? "Välj kön" : null),
        },
    });

    const addMember = (values: { age: string | number; sex: string }) => {
        const newMember: HouseholdMember = {
            id: nanoid(8),
            age: Number(values.age),
            sex: values.sex,
        };

        const updatedMembers = [...members, newMember];
        setMembers(updatedMembers);
        updateData(updatedMembers);
        addMemberForm.reset();
    };

    const removeMember = (index: number) => {
        const updatedMembers = members.filter((_, i) => i !== index);
        setMembers(updatedMembers);
        updateData(updatedMembers);
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Medlemmar i hushållet
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Lägg till alla medlemmar i hushållet. Dessa uppgifter används för att beräkna
                matmängd och särskilda behov.
            </Text>

            {members.length > 0 && (
                <>
                    <Title order={5} mt="md" mb="xs">
                        Registrerade medlemmar:
                    </Title>
                    {members.map((member, index) => (
                        <Group key={member.id || index} mb="xs" position="apart">
                            <Text>
                                {member.age} år,{" "}
                                {member.sex === "male"
                                    ? "Man"
                                    : member.sex === "female"
                                      ? "Kvinna"
                                      : "Annat"}
                            </Text>
                            <ActionIcon color="red" onClick={() => removeMember(index)}>
                                <IconTrash size="1rem" />
                            </ActionIcon>
                        </Group>
                    ))}
                </>
            )}

            <form onSubmit={addMemberForm.onSubmit(addMember)}>
                <Title order={5} mt="xl" mb="md">
                    Lägg till medlem
                </Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <NumberInput
                        label="Ålder"
                        placeholder="Ange ålder"
                        withAsterisk
                        min={0}
                        max={120}
                        {...addMemberForm.getInputProps("age")}
                    />
                    <Select
                        label="Kön"
                        placeholder="Välj kön"
                        withAsterisk
                        data={[
                            { value: "male", label: "Man" },
                            { value: "female", label: "Kvinna" },
                            { value: "other", label: "Annat" },
                        ]}
                        {...addMemberForm.getInputProps("sex")}
                    />
                </SimpleGrid>
                <Group position="right" mt="md">
                    <Button type="submit">Lägg till medlem</Button>
                </Group>
            </form>
        </Card>
    );
}
