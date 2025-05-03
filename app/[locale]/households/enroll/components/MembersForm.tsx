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
import { useTranslations } from "next-intl";

interface MembersFormProps {
    data: HouseholdMember[];
    updateData: (data: HouseholdMember[]) => void;
}

export default function MembersForm({ data, updateData }: MembersFormProps) {
    const t = useTranslations("members");

    // Initialize with data from parent, using Mantine's useForm with improved validation options
    const addMemberForm = useForm({
        initialValues: {
            age: "",
            sex: "male",
        },
        validate: {
            age: value => (!value ? t("validation.ageRequired") : null),
            sex: value => (!value ? t("validation.genderRequired") : null),
        },
        validateInputOnBlur: true, // Only validate when field loses focus
        validateInputOnChange: false, // Don't validate while typing
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
                {t("title")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("description")}
            </Text>

            {data.length === 0 && (
                <Alert
                    icon={<IconInfoCircle size="1rem" />}
                    title={t("noMembers")}
                    color="blue"
                    mb="md"
                >
                    {t("addInstructions")}
                </Alert>
            )}

            {data.length > 0 && (
                <Box mb="md">
                    <Title order={5} mb="xs">
                        {t("registered")}
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
                                        {member.age} {t("ageUnit")},{" "}
                                        {member.sex === "male"
                                            ? t("gender.male")
                                            : member.sex === "female"
                                              ? t("gender.female")
                                              : t("gender.other")}
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
                        {t("addPerson")}
                    </Title>

                    <Flex align="flex-end" gap="md" wrap="wrap">
                        <Box style={{ minHeight: "75px" }}>
                            <NumberInput
                                label={t("age")}
                                placeholder={t("age")}
                                withAsterisk
                                min={0}
                                max={120}
                                {...addMemberForm.getInputProps("age")}
                                styles={{ wrapper: { width: "120px" } }}
                            />
                        </Box>

                        <Box>
                            <Text fw={500} size="sm" mb={7}>
                                {t("gender.label")}{" "}
                                <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                            </Text>
                            <SegmentedControl
                                data={[
                                    { value: "male", label: t("gender.male") },
                                    { value: "female", label: t("gender.female") },
                                    { value: "other", label: t("gender.other") },
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
                            {t("addPerson")}
                        </Button>
                    </Flex>
                </Paper>
            </form>
        </Card>
    );
}
