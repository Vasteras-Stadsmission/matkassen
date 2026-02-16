"use client";

import { useRef } from "react";
import {
    Button,
    Title,
    Text,
    Card,
    NumberInput,
    SegmentedControl,
    ActionIcon,
    Badge,
    Group,
    Stack,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconTrash, IconPlus } from "@tabler/icons-react";
import { HouseholdMember } from "../types";
import { useTranslations } from "next-intl";

interface MembersFormProps {
    data: HouseholdMember[];
    updateData: (data: HouseholdMember[]) => void;
}

export default function MembersForm({ data, updateData }: MembersFormProps) {
    const t = useTranslations("members");
    const ageInputRef = useRef<HTMLInputElement>(null);

    const addMemberForm = useForm({
        initialValues: {
            age: "",
            sex: "male",
        },
        validate: {
            age: value => (!value ? t("validation.ageRequired") : null),
            sex: value => (!value ? t("validation.genderRequired") : null),
        },
        validateInputOnBlur: true,
        validateInputOnChange: false,
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
        addMemberForm.setFieldValue("sex", "male");

        // Auto-focus age input for rapid entry
        setTimeout(() => ageInputRef.current?.focus(), 0);
    };

    const removeMember = (index: number) => {
        const updatedMembers = data.filter((_, i) => i !== index);
        updateData(updatedMembers);
    };

    const genderLabel = (sex: string) => {
        switch (sex) {
            case "male":
                return t("gender.male");
            case "female":
                return t("gender.female");
            default:
                return t("gender.other");
        }
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="xs">
                {t("title")}
            </Title>
            <Text c="dimmed" size="sm" mb="md">
                {t("description")}
            </Text>

            <Stack gap={0}>
                {data.map((member, index) => (
                    <Group
                        key={member.id || index}
                        gap="sm"
                        py="xs"
                        style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
                    >
                        <Text fw={500} size="sm">
                            {member.age} {t("ageUnit")}
                        </Text>
                        <Badge variant="default" size="lg" fw={400}>
                            {genderLabel(member.sex)}
                        </Badge>
                        <ActionIcon
                            color="red"
                            variant="subtle"
                            size="sm"
                            onClick={() => removeMember(index)}
                        >
                            <IconTrash size="0.875rem" />
                        </ActionIcon>
                    </Group>
                ))}

                <form onSubmit={addMemberForm.onSubmit(addMember)}>
                    <Group gap="sm" pt="sm">
                        <NumberInput
                            ref={ageInputRef}
                            placeholder={t("age")}
                            min={0}
                            max={120}
                            {...addMemberForm.getInputProps("age")}
                            styles={{ input: { width: "80px" } }}
                            size="sm"
                        />
                        <SegmentedControl
                            size="sm"
                            data={[
                                { value: "male", label: t("gender.male") },
                                { value: "female", label: t("gender.female") },
                                { value: "other", label: t("gender.other") },
                            ]}
                            {...addMemberForm.getInputProps("sex")}
                        />
                        <Button
                            type="submit"
                            variant="light"
                            color="teal"
                            size="sm"
                            leftSection={<IconPlus size="0.875rem" />}
                        >
                            {t("addPerson")}
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Card>
    );
}
