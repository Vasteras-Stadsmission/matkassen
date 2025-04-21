"use client";

import { useState, useEffect } from "react";
import { DataTable } from "mantine-datatable";
import {
    Modal,
    Button,
    TextInput,
    Group,
    Box,
    LoadingOverlay,
    ActionIcon,
    Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconSearch, IconX, IconEye } from "@tabler/icons-react";
import { getRecipientDetails } from "../actions";
import RecipientDetail from "./RecipientDetail";

interface Recipient {
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

interface RecipientDetail {
    household: {
        first_name: string;
        last_name: string;
        phone_number: string;
        locale: string;
        postal_code: string;
    };
    members: any[];
    dietaryRestrictions: any[];
    additionalNeeds: any[];
    pets: any[];
    foodParcels: any;
    pickupLocation: any;
}

export default function RecipientsTable({ initialRecipients }: { initialRecipients: Recipient[] }) {
    const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
    const [filteredRecipients, setFilteredRecipients] = useState<Recipient[]>(initialRecipients);
    const [search, setSearch] = useState("");
    const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
    const [recipientDetail, setRecipientDetail] = useState<RecipientDetail | null>(null);
    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);
    const [sortStatus, setSortStatus] = useState({
        columnAccessor: "last_name",
        direction: "asc" as "asc" | "desc",
    });

    // Format date for display
    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return "-";
        return new Date(date).toLocaleDateString("sv-SE");
    };

    // Format time for display
    const formatTime = (date: string | Date | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Format full date and time
    const formatDateTime = (date: string | Date | null | undefined) => {
        if (!date) return "-";
        return `${formatDate(date)} ${formatTime(date)}`;
    };

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

    // Locale code to full language name in Swedish
    const getLanguageName = (locale: string) => {
        const languageMap: Record<string, string> = {
            sv: "Svenska",
            en: "Engelska",
            de: "Tyska",
            fr: "Franska",
            es: "Spanska",
            fi: "Finska",
            no: "Norska",
            da: "Danska",
            pl: "Polska",
            ru: "Ryska",
            ar: "Arabiska",
            fa: "Persiska",
            ti: "Tigrinja",
            so: "Somaliska",
            am: "Amhariska",
            ku: "Kurdiska",
            tr: "Turkiska",
            uk: "Ukrainska",
            ro: "Rumänska",
            th: "Thailändska",
            zh: "Kinesiska",
            vi: "Vietnamesiska",
            ur: "Urdu",
            hi: "Hindi",
            bn: "Bengali",
        };

        return languageMap[locale] || locale; // Return the code itself if not found in the map
    };

    // Handle row click to open detail modal
    const handleRowClick = async (recipientId: string) => {
        setSelectedRecipient(recipientId);
        setLoading(true);
        open();

        try {
            const details = await getRecipientDetails(recipientId);
            setRecipientDetail(details);
        } catch (error) {
            console.error("Error fetching recipient details:", error);
        } finally {
            setLoading(false);
        }
    };

    // Filter recipients based on search term
    useEffect(() => {
        if (!search.trim()) {
            setFilteredRecipients(recipients);
            return;
        }

        const searchLower = search.toLowerCase();
        const filtered = recipients.filter(recipient => {
            return (
                recipient.first_name.toLowerCase().includes(searchLower) ||
                recipient.last_name.toLowerCase().includes(searchLower) ||
                recipient.phone_number.toLowerCase().includes(searchLower) ||
                recipient.postal_code.toLowerCase().includes(searchLower) ||
                recipient.locale.toLowerCase().includes(searchLower) ||
                (recipient.nextParcelDate &&
                    formatDateTime(recipient.nextParcelDate).toLowerCase().includes(searchLower)) ||
                (recipient.firstParcelDate &&
                    formatDate(recipient.firstParcelDate).toLowerCase().includes(searchLower)) ||
                (recipient.lastParcelDate &&
                    formatDate(recipient.lastParcelDate).toLowerCase().includes(searchLower))
            );
        });

        setFilteredRecipients(filtered);
    }, [search, recipients]);

    // Handle sorting
    useEffect(() => {
        let sorted = [...recipients];
        const { columnAccessor, direction } = sortStatus;

        sorted.sort((a: any, b: any) => {
            let aValue = a[columnAccessor];
            let bValue = b[columnAccessor];

            // Handle date comparisons
            if (columnAccessor.includes("Date")) {
                aValue = aValue ? new Date(aValue).getTime() : 0;
                bValue = bValue ? new Date(bValue).getTime() : 0;
            } else {
                // Handle string comparisons
                aValue = aValue?.toString().toLowerCase() || "";
                bValue = bValue?.toString().toLowerCase() || "";
            }

            if (direction === "asc") {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });

        setFilteredRecipients(sorted);
    }, [sortStatus, recipients]);

    // Close modal and reset selected recipient
    const handleCloseModal = () => {
        close();
        setSelectedRecipient(null);
        setRecipientDetail(null);
    };

    console.log("Filtered recipients:", filteredRecipients);
    console.log("Sort status:", sortStatus);

    return (
        <>
            {/* Search input */}
            <Box mb="md">
                <TextInput
                    placeholder="Sök mottagare..."
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
                records={filteredRecipients}
                columns={[
                    {
                        accessor: "actions",
                        title: "",
                        width: 80,
                        render: recipient => (
                            <Tooltip label="Visa detaljer" withArrow position="left">
                                <ActionIcon
                                    color="blue"
                                    variant="subtle"
                                    onClick={() => handleRowClick(recipient.id)}
                                >
                                    <IconEye size={18} />
                                </ActionIcon>
                            </Tooltip>
                        ),
                    },
                    { accessor: "first_name", title: "Förnamn", sortable: true },
                    { accessor: "last_name", title: "Efternamn", sortable: true },
                    { accessor: "phone_number", title: "Telefonnummer", sortable: true },
                    {
                        accessor: "locale",
                        title: "Språk",
                        sortable: true,
                        render: recipient => getLanguageName(recipient.locale),
                    },
                    {
                        accessor: "postal_code",
                        title: "Postnummer",
                        sortable: true,
                        render: recipient => formatPostalCode(recipient.postal_code),
                    },
                    {
                        accessor: "firstParcelDate",
                        title: "Första matkasse",
                        sortable: true,
                        render: recipient => formatDate(recipient.firstParcelDate),
                    },
                    {
                        accessor: "lastParcelDate",
                        title: "Sista matkasse",
                        sortable: true,
                        render: recipient => formatDate(recipient.lastParcelDate),
                    },
                    {
                        accessor: "nextParcelDate",
                        title: "Nästa matkasse",
                        sortable: true,
                        render: recipient => formatDateTime(recipient.nextParcelDate),
                    },
                ]}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                // The below is a workaround to hide the "No records" message when there are filtered results
                emptyState={filteredRecipients.length > 0 ? <></> : undefined}
            />

            {/* Recipient detail modal */}
            <Modal
                opened={opened}
                onClose={handleCloseModal}
                title="Mottagarinformation"
                size="xl"
                centered
            >
                <LoadingOverlay visible={loading} />
                {recipientDetail && <RecipientDetail recipientDetail={recipientDetail} />}
            </Modal>
        </>
    );
}
