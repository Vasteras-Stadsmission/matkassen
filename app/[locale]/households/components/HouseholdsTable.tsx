"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "mantine-datatable";
import {
    Modal,
    TextInput,
    Box,
    LoadingOverlay,
    ActionIcon,
    Tooltip,
    Title,
    Group,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconSearch, IconX, IconEye, IconEdit } from "@tabler/icons-react";
import { getHouseholdDetails, addHouseholdComment, deleteHouseholdComment } from "../actions";
import HouseholdDetail from "./HouseholdDetail";
import { useRouter } from "@/app/i18n/navigation";
import { Comment } from "../enroll/types";
import { useTranslations } from "next-intl";
import { getLanguageName as getLanguageNameFromLocale } from "@/app/constants/languages";
import { useLocale } from "next-intl";

interface Household {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
    firstParcelDate: string | Date | null;
    lastParcelDate: string | Date | null;
    nextParcelDate: string | Date | null;
    nextParcelEarliestTime: string | Date | null;
    created_at?: Date;
}

interface HouseholdDetail {
    household: {
        first_name: string;
        last_name: string;
        phone_number: string;
        locale: string;
        postal_code: string;
    };
    members: {
        id?: string;
        age: number;
        sex: string;
    }[];
    dietaryRestrictions: {
        id: string;
        name: string;
    }[];
    additionalNeeds: {
        id: string;
        need: string;
    }[];
    pets: {
        id?: string;
        species: string;
        speciesName?: string;
    }[];
    foodParcels: {
        pickupLocationId: string;
        totalCount: number;
        weekday: string;
        repeatValue: string;
        startDate: Date;
        parcels: {
            id?: string;
            pickupDate: Date;
            pickupEarliestTime: Date;
            pickupLatestTime: Date;
            isPickedUp?: boolean;
        }[];
    };
    pickupLocation: {
        id: string;
        name: string;
        address?: string;
    } | null;
    comments?: Comment[];
}

export default function HouseholdsTable({ households }: { households: Household[] }) {
    const router = useRouter();
    const t = useTranslations("households");
    const currentLocale = useLocale();
    const [filteredHouseholds, setFilteredHouseholds] = useState<Household[]>(households);
    const [search, setSearch] = useState("");
    const [householdDetail, setHouseholdDetail] = useState<HouseholdDetail | null>(null);
    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);
    const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
    const [sortStatus, setSortStatus] = useState({
        columnAccessor: "last_name",
        direction: "asc" as "asc" | "desc",
    });

    // Format date for display
    const formatDate = useCallback((date: string | Date | null | undefined) => {
        if (!date) return "-";
        return new Date(date).toLocaleDateString("sv-SE");
    }, []);

    // Format time for display
    const formatTime = useCallback((date: string | Date | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    }, []);

    // Format full date and time
    const formatDateTime = useCallback(
        (date: string | Date | null | undefined) => {
            if (!date) return "-";
            return `${formatDate(date)} ${formatTime(date)}`;
        },
        [formatDate, formatTime],
    );

    // Format postal code as XXX XX
    const formatPostalCode = (postalCode: string) => {
        if (!postalCode) return "";
        // Remove any non-digits
        const digits = postalCode.replace(/\D/g, "");
        if (digits.length === 5) {
            return `${digits.substring(0, 3)} ${digits.substring(3)}`;
        }
        return postalCode; // Return original if not 5 digits
    };

    // Function to get language name from locale code
    const getLanguageName = (locale: string): string => {
        // Use the proper getLanguageName function from constants
        return getLanguageNameFromLocale(locale, currentLocale);
    };

    // Handle row click to open detail modal
    const handleRowClick = async (householdId: string) => {
        setLoading(true);
        setSelectedHouseholdId(householdId);
        open();

        try {
            const details = await getHouseholdDetails(householdId);
            setHouseholdDetail(details);
        } catch (error) {
            console.error("Error fetching household details:", error);
        } finally {
            setLoading(false);
        }
    };

    // Handle adding a comment
    const handleAddComment = async (comment: string) => {
        if (!selectedHouseholdId || !comment.trim()) return;

        try {
            setLoading(true);
            const newComment = await addHouseholdComment(selectedHouseholdId, comment);

            // Refresh household details to include the new comment
            const updatedDetails = await getHouseholdDetails(selectedHouseholdId);
            setHouseholdDetail(updatedDetails);

            return newComment;
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setLoading(false);
        }
    };

    // Handle deleting a comment
    const handleDeleteComment = async (commentId: string): Promise<void> => {
        try {
            setLoading(true);
            const success = await deleteHouseholdComment(commentId);

            if (success && selectedHouseholdId) {
                // Refresh household details to update comments
                const updatedDetails = await getHouseholdDetails(selectedHouseholdId);
                setHouseholdDetail(updatedDetails);
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
        } finally {
            setLoading(false);
        }
    };

    // Handle navigation to edit page
    const handleEditClick = (householdId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click handler from firing
        router.push(`/households/${householdId}/edit`);
    };

    // Filter households based on search term
    useEffect(() => {
        if (!search.trim()) {
            setFilteredHouseholds(households);
            return;
        }

        const searchLower = search.toLowerCase();
        const filtered = households.filter(household => {
            return (
                household.first_name.toLowerCase().includes(searchLower) ||
                household.last_name.toLowerCase().includes(searchLower) ||
                household.phone_number.toLowerCase().includes(searchLower) ||
                household.postal_code.toLowerCase().includes(searchLower) ||
                household.locale.toLowerCase().includes(searchLower) ||
                (household.nextParcelDate &&
                    formatDateTime(household.nextParcelDate).toLowerCase().includes(searchLower)) ||
                (household.firstParcelDate &&
                    formatDate(household.firstParcelDate).toLowerCase().includes(searchLower)) ||
                (household.lastParcelDate &&
                    formatDate(household.lastParcelDate).toLowerCase().includes(searchLower))
            );
        });

        setFilteredHouseholds(filtered);
    }, [search, households, formatDate, formatDateTime]);

    // Handle sorting
    useEffect(() => {
        const sorted = [...households];
        const { columnAccessor, direction } = sortStatus;

        sorted.sort((a: Household, b: Household) => {
            const aValue = a[columnAccessor as keyof Household];
            const bValue = b[columnAccessor as keyof Household];

            // Handle date comparisons
            if (columnAccessor.includes("Date")) {
                const aTime = aValue ? new Date(aValue).getTime() : 0;
                const bTime = bValue ? new Date(bValue).getTime() : 0;

                if (direction === "asc") {
                    return aTime > bTime ? 1 : -1;
                } else {
                    return aTime < bTime ? 1 : -1;
                }
            } else {
                // Handle string comparisons
                const aString = aValue?.toString().toLowerCase() || "";
                const bString = bValue?.toString().toLowerCase() || "";

                if (direction === "asc") {
                    return aString > bString ? 1 : -1;
                } else {
                    return aString < bString ? 1 : -1;
                }
            }
        });

        setFilteredHouseholds(sorted);
    }, [sortStatus, households]);

    // Close modal and reset selected household
    const handleCloseModal = () => {
        close();
        setHouseholdDetail(null);
        setSelectedHouseholdId(null);
    };

    return (
        <>
            {/* Search input */}
            <Box mb="md">
                <TextInput
                    placeholder={t("search.placeholder")}
                    value={search}
                    onChange={e => setSearch(e.currentTarget.value)}
                    leftSection={<IconSearch size={16} />}
                    rightSection={
                        search ? (
                            <IconX
                                size={16}
                                style={{ cursor: "pointer" }}
                                onClick={() => setSearch("")}
                            />
                        ) : null
                    }
                />
            </Box>

            <DataTable
                withTableBorder
                borderRadius="sm"
                striped
                highlightOnHover
                records={filteredHouseholds}
                columns={[
                    {
                        accessor: "actions",
                        title: "",
                        width: 120,
                        render: household => (
                            <Group gap="xs">
                                <Tooltip label={t("actions.view")} withArrow position="left">
                                    <ActionIcon
                                        color="blue"
                                        variant="subtle"
                                        onClick={() => handleRowClick(household.id)}
                                    >
                                        <IconEye size={18} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label={t("actions.edit")} withArrow position="right">
                                    <ActionIcon
                                        color="yellow"
                                        variant="subtle"
                                        onClick={e => handleEditClick(household.id, e)}
                                    >
                                        <IconEdit size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        ),
                    },
                    { accessor: "first_name", title: t("table.firstName"), sortable: true },
                    { accessor: "last_name", title: t("table.lastName"), sortable: true },
                    { accessor: "phone_number", title: t("table.phoneNumber"), sortable: true },
                    {
                        accessor: "locale",
                        title: t("table.language"),
                        sortable: true,
                        render: household => getLanguageName(household.locale),
                    },
                    {
                        accessor: "postal_code",
                        title: t("table.postalCode"),
                        sortable: true,
                        render: household => formatPostalCode(household.postal_code),
                    },
                    {
                        accessor: "firstParcelDate",
                        title: t("table.firstParcel"),
                        sortable: true,
                        render: household => formatDate(household.firstParcelDate),
                    },
                    {
                        accessor: "lastParcelDate",
                        title: t("table.lastParcel"),
                        sortable: true,
                        render: household => formatDate(household.lastParcelDate),
                    },
                    {
                        accessor: "nextParcelDate",
                        title: t("table.nextParcel"),
                        sortable: true,
                        render: household => formatDateTime(household.nextParcelDate),
                    },
                ]}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                // The below is a workaround to hide the "No records" message when there are filtered results
                emptyState={filteredHouseholds.length > 0 ? <></> : undefined}
            />

            {/* Household detail modal */}
            <Modal
                opened={opened}
                onClose={handleCloseModal}
                title={
                    <Title order={2} fw={700} ta="center" c="blue.8" component="div">
                        {householdDetail
                            ? t("modal.title", {
                                  firstName: householdDetail.household.first_name,
                                  lastName: householdDetail.household.last_name,
                              })
                            : t("modal.loading")}
                    </Title>
                }
                size="80%"
                centered
            >
                <LoadingOverlay visible={loading} />
                {householdDetail && (
                    <HouseholdDetail
                        householdDetail={householdDetail}
                        onAddComment={handleAddComment}
                        onDeleteComment={handleDeleteComment}
                    />
                )}
            </Modal>
        </>
    );
}
