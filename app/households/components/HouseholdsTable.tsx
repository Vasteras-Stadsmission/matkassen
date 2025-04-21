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
import { getHouseholdDetails } from "../actions";
import HouseholdDetail from "./HouseholdDetail";

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
    members: any[];
    dietaryRestrictions: any[];
    additionalNeeds: any[];
    pets: any[];
    foodParcels: any;
    pickupLocation: any;
}

export default function HouseholdsTable({ initialHouseholds }: { initialHouseholds: Household[] }) {
    const [households, setHouseholds] = useState<Household[]>(initialHouseholds);
    const [filteredHouseholds, setFilteredHouseholds] = useState<Household[]>(initialHouseholds);
    const [search, setSearch] = useState("");
    const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);
    const [householdDetail, setHouseholdDetail] = useState<HouseholdDetail | null>(null);
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
    const handleRowClick = async (householdId: string) => {
        setSelectedHousehold(householdId);
        setLoading(true);
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
    }, [search, households]);

    // Handle sorting
    useEffect(() => {
        let sorted = [...households];
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

        setFilteredHouseholds(sorted);
    }, [sortStatus, households]);

    // Close modal and reset selected household
    const handleCloseModal = () => {
        close();
        setSelectedHousehold(null);
        setHouseholdDetail(null);
    };

    return (
        <>
            {/* Search input */}
            <Box mb="md">
                <TextInput
                    placeholder="Sök hushåll..."
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
                        width: 80,
                        render: household => (
                            <Tooltip label="Visa detaljer" withArrow position="left">
                                <ActionIcon
                                    color="blue"
                                    variant="subtle"
                                    onClick={() => handleRowClick(household.id)}
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
                        render: household => getLanguageName(household.locale),
                    },
                    {
                        accessor: "postal_code",
                        title: "Postnummer",
                        sortable: true,
                        render: household => formatPostalCode(household.postal_code),
                    },
                    {
                        accessor: "firstParcelDate",
                        title: "Första matkasse",
                        sortable: true,
                        render: household => formatDate(household.firstParcelDate),
                    },
                    {
                        accessor: "lastParcelDate",
                        title: "Sista matkasse",
                        sortable: true,
                        render: household => formatDate(household.lastParcelDate),
                    },
                    {
                        accessor: "nextParcelDate",
                        title: "Nästa matkasse",
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
                title="Hushållsinformation"
                size="xl"
                centered
            >
                <LoadingOverlay visible={loading} />
                {householdDetail && <HouseholdDetail householdDetail={householdDetail} />}
            </Modal>
        </>
    );
}
