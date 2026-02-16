"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DataTable } from "mantine-datatable";
import {
    TextInput,
    ActionIcon,
    Tooltip,
    Group,
    Button,
    Menu,
    Checkbox,
    Stack,
    Select,
} from "@mantine/core";
import {
    IconSearch,
    IconX,
    IconPlus,
    IconEye,
    IconEdit,
    IconPackage,
    IconColumns,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/app/i18n/navigation";
import { getLanguageName as getLanguageNameFromLocale } from "@/app/constants/languages";
import { useLocale } from "next-intl";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";

export interface Household {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    created_by: string | null;
    primaryPickupLocationName: string | null;
    firstParcelDate: string | Date | null;
    lastParcelDate: string | Date | null;
    nextParcelDate: string | Date | null;
    nextParcelEarliestTime: string | Date | null;
    created_at?: Date;
}

type ColumnKey =
    | "first_name"
    | "last_name"
    | "phone_number"
    | "locale"
    | "created_by"
    | "primaryPickupLocationName"
    | "firstParcelDate"
    | "lastParcelDate"
    | "nextParcelDate";

export default function HouseholdsTable({ households }: { households: Household[] }) {
    const router = useRouter();
    const t = useTranslations("households");
    const currentLocale = useLocale();
    const [search, setSearch] = useState("");
    const [locationFilter, setLocationFilter] = useState<string | null>(null);
    const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
    const [sortStatus, setSortStatus] = useState({
        columnAccessor: "last_name",
        direction: "asc" as "asc" | "desc",
    });

    // Compute unique location options from household data
    const locationOptions = useMemo(() => {
        const names = new Set<string>();
        households.forEach(h => {
            if (h.primaryPickupLocationName) names.add(h.primaryPickupLocationName);
        });
        return Array.from(names)
            .sort()
            .map(name => ({ value: name, label: name }));
    }, [households]);

    // Compute unique creator options from household data
    const creatorOptions = useMemo(() => {
        const creators = new Set<string>();
        households.forEach(h => {
            if (h.created_by) creators.add(h.created_by);
        });
        return Array.from(creators)
            .sort()
            .map(name => ({ value: name, label: name }));
    }, [households]);

    // Column visibility state with localStorage persistence
    const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
        // Default visibility
        const defaultColumns = {
            first_name: true,
            last_name: true,
            phone_number: true,
            locale: false, // Hidden by default - available on detail page
            created_by: true,
            primaryPickupLocationName: true,
            firstParcelDate: false, // Hidden by default - less actionable than last/next
            lastParcelDate: true,
            nextParcelDate: true,
        };

        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem("householdsTableColumnsV2");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Validate that parsed value is a plain object (not array, not null)
                    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                        return { ...defaultColumns, ...parsed };
                    }
                }
            } catch (error) {
                // Storage access error (Safari private mode) or invalid JSON
                console.warn("Failed to load column preferences from localStorage", error);
            }
        }

        return defaultColumns;
    });

    // Save column visibility to localStorage
    useEffect(() => {
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem("householdsTableColumnsV2", JSON.stringify(visibleColumns));
            } catch (error) {
                // Storage access error (Safari private mode, QuotaExceededError)
                console.warn("Failed to save column preferences to localStorage", error);
            }
        }
    }, [visibleColumns]);

    // Toggle column visibility
    const toggleColumn = (column: ColumnKey) => {
        setVisibleColumns(prev => ({
            ...prev,
            [column]: !prev[column],
        }));
    };

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

    // Function to get language name from locale code
    const getLanguageName = (locale: string): string => {
        // Use the proper getLanguageName function from constants
        return getLanguageNameFromLocale(locale, currentLocale);
    };

    // Handle row click to navigate to household details page
    const handleRowClick = useCallback(
        async (householdId: string) => {
            // Navigate to the household details page
            router.push(`/households/${householdId}`);
        },
        [router],
    );

    // Handle navigation to edit page
    const handleEditClick = (householdId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click handler from firing
        router.push(`/households/${householdId}/edit`);
    };

    // Handle navigation to parcel management page
    const handleManageParcelsClick = (householdId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click handler from firing
        router.push(`/households/${householdId}/parcels`);
    };

    // Single memoized pipeline: filter then sort
    const filteredHouseholds = useMemo(() => {
        let filtered = households;

        // Apply location filter
        if (locationFilter) {
            filtered = filtered.filter(h => h.primaryPickupLocationName === locationFilter);
        }

        // Apply creator filter
        if (creatorFilter) {
            filtered = filtered.filter(h => h.created_by === creatorFilter);
        }

        // Apply text search
        if (search.trim()) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(household => {
                return (
                    household.first_name.toLowerCase().includes(searchLower) ||
                    household.last_name.toLowerCase().includes(searchLower) ||
                    household.phone_number.toLowerCase().includes(searchLower) ||
                    household.locale.toLowerCase().includes(searchLower) ||
                    (household.nextParcelDate &&
                        formatDateTime(household.nextParcelDate)
                            .toLowerCase()
                            .includes(searchLower)) ||
                    (household.firstParcelDate &&
                        formatDate(household.firstParcelDate)
                            .toLowerCase()
                            .includes(searchLower)) ||
                    (household.lastParcelDate &&
                        formatDate(household.lastParcelDate).toLowerCase().includes(searchLower))
                );
            });
        }

        // Apply sorting
        const { columnAccessor, direction } = sortStatus;
        const sorted = [...filtered];

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

        return sorted;
    }, [search, locationFilter, creatorFilter, sortStatus, households, formatDate, formatDateTime]);

    return (
        <>
            {/* Header section with search, filters, and new household button */}
            <Group justify="space-between" mb="md" gap="md" wrap="wrap">
                <Group gap="sm" style={{ flex: 1 }} wrap="wrap">
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
                        style={{ flex: 1, maxWidth: "300px", minWidth: "180px" }}
                    />
                    <Select
                        placeholder={t("filters.location")}
                        data={locationOptions}
                        value={locationFilter}
                        onChange={setLocationFilter}
                        clearable
                        searchable
                        style={{ minWidth: "180px", maxWidth: "220px" }}
                    />
                    <Select
                        placeholder={t("filters.createdBy")}
                        data={creatorOptions}
                        value={creatorFilter}
                        onChange={setCreatorFilter}
                        clearable
                        searchable
                        style={{ minWidth: "160px", maxWidth: "200px" }}
                    />
                </Group>
                <Group gap="sm">
                    <Menu shadow="md" width={250}>
                        <Menu.Target>
                            <Button
                                leftSection={<IconColumns size={16} />}
                                variant="light"
                                color="gray"
                            >
                                {t("table.columns")}
                            </Button>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>{t("table.visibleColumns")}</Menu.Label>
                            <Stack gap="xs" p="xs">
                                <Checkbox
                                    label={t("table.firstName")}
                                    checked={visibleColumns.first_name}
                                    onChange={() => toggleColumn("first_name")}
                                />
                                <Checkbox
                                    label={t("table.lastName")}
                                    checked={visibleColumns.last_name}
                                    onChange={() => toggleColumn("last_name")}
                                />
                                <Checkbox
                                    label={t("table.phoneNumber")}
                                    checked={visibleColumns.phone_number}
                                    onChange={() => toggleColumn("phone_number")}
                                />
                                <Checkbox
                                    label={t("table.language")}
                                    checked={visibleColumns.locale}
                                    onChange={() => toggleColumn("locale")}
                                />
                                <Checkbox
                                    label={t("table.createdBy")}
                                    checked={visibleColumns.created_by}
                                    onChange={() => toggleColumn("created_by")}
                                />
                                <Checkbox
                                    label={t("table.primaryLocation")}
                                    checked={visibleColumns.primaryPickupLocationName}
                                    onChange={() => toggleColumn("primaryPickupLocationName")}
                                />
                                <Checkbox
                                    label={t("table.firstParcel")}
                                    checked={visibleColumns.firstParcelDate}
                                    onChange={() => toggleColumn("firstParcelDate")}
                                />
                                <Checkbox
                                    label={t("table.lastParcel")}
                                    checked={visibleColumns.lastParcelDate}
                                    onChange={() => toggleColumn("lastParcelDate")}
                                />
                                <Checkbox
                                    label={t("table.nextParcel")}
                                    checked={visibleColumns.nextParcelDate}
                                    onChange={() => toggleColumn("nextParcelDate")}
                                />
                            </Stack>
                        </Menu.Dropdown>
                    </Menu>
                    <Button
                        leftSection={<IconPlus size={16} />}
                        onClick={() => router.push("/households/enroll")}
                        variant="filled"
                        color="blue"
                    >
                        {t("table.actions.newHousehold")}
                    </Button>
                </Group>
            </Group>

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
                        width: 160,
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
                                <Tooltip
                                    label={t("actions.manageParcels")}
                                    withArrow
                                    position="top"
                                >
                                    <ActionIcon
                                        color="green"
                                        variant="subtle"
                                        onClick={e => handleManageParcelsClick(household.id, e)}
                                    >
                                        <IconPackage size={18} />
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
                    ...(visibleColumns.first_name
                        ? [
                              {
                                  accessor: "first_name",
                                  title: t("table.firstName"),
                                  sortable: true,
                              },
                          ]
                        : []),
                    ...(visibleColumns.last_name
                        ? [
                              {
                                  accessor: "last_name",
                                  title: t("table.lastName"),
                                  sortable: true,
                              },
                          ]
                        : []),
                    ...(visibleColumns.phone_number
                        ? [
                              {
                                  accessor: "phone_number",
                                  title: t("table.phoneNumber"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      formatPhoneForDisplay(household.phone_number),
                              },
                          ]
                        : []),
                    ...(visibleColumns.locale
                        ? [
                              {
                                  accessor: "locale",
                                  title: t("table.language"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      getLanguageName(household.locale),
                              },
                          ]
                        : []),
                    ...(visibleColumns.created_by
                        ? [
                              {
                                  accessor: "created_by",
                                  title: t("table.createdBy"),
                                  sortable: true,
                                  render: (household: Household) => household.created_by || "-",
                              },
                          ]
                        : []),
                    ...(visibleColumns.primaryPickupLocationName
                        ? [
                              {
                                  accessor: "primaryPickupLocationName",
                                  title: t("table.primaryLocation"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      household.primaryPickupLocationName || "-",
                              },
                          ]
                        : []),
                    ...(visibleColumns.firstParcelDate
                        ? [
                              {
                                  accessor: "firstParcelDate",
                                  title: t("table.firstParcel"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      formatDate(household.firstParcelDate),
                              },
                          ]
                        : []),
                    ...(visibleColumns.lastParcelDate
                        ? [
                              {
                                  accessor: "lastParcelDate",
                                  title: t("table.lastParcel"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      formatDate(household.lastParcelDate),
                              },
                          ]
                        : []),
                    ...(visibleColumns.nextParcelDate
                        ? [
                              {
                                  accessor: "nextParcelDate",
                                  title: t("table.nextParcel"),
                                  sortable: true,
                                  render: (household: Household) =>
                                      formatDateTime(household.nextParcelDate),
                              },
                          ]
                        : []),
                ]}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                // The below is a workaround to hide the "No records" message when there are filtered results
                emptyState={filteredHouseholds.length > 0 ? <></> : undefined}
            />
        </>
    );
}
