import { notFound } from "next/navigation";
import { Metadata } from "next";
import {
    getPublicParcelData,
    getParcelStatus,
    generateMapsUrls,
    generateAdminUrl,
    type PublicParcelData,
    type ParcelStatus,
} from "@/app/utils/public-parcel-data";
import {
    SUPPORTED_LOCALES,
    detectPublicPageLocale,
    isRtlLocale,
    type SupportedLocale,
} from "@/app/utils/locale-detection";
import { logger } from "@/app/utils/logger";
import { QRCodeCanvas } from "@/app/components/QRCodeCanvas";
import {
    Paper,
    Title,
    Text,
    Group,
    Badge,
    Button,
    Stack,
    Divider,
    MantineProvider,
} from "@mantine/core";
import { IconMapPin, IconClock, IconExternalLink } from "@tabler/icons-react";
import { PublicLocaleSwitcher } from "@/app/components/PublicLocaleSwitcher";
import { logError } from "@/app/utils/logger";

interface PublicParcelPageProps {
    params: Promise<{
        parcelId: string;
    }>;
    searchParams?:
        | Promise<Record<string, string | string[] | undefined>>
        | Record<string, string | string[] | undefined>;
}

// Metadata to prevent search engine indexing
export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
    },
};

// Interface for public messages structure
interface PublicMessages {
    publicParcel: {
        title: string;
        pickupInfo: string;
        location: string;
        pickupWindow: string;
        qrCodeLabel: string;
        qrCodeDescription: string;
        mapsLabel: string;
        googleMaps: string;
        appleMaps: string;
        statusLabel?: string;
        languageSelectorLabel?: string;
        languageSelectorDescription?: string;
        languageSelectorAriaLabel?: string;
        status: {
            scheduled: string;
            ready: string;
            collected: string;
            expired: string;
            cancelled: string;
        };
        statusDescription: {
            scheduled: string;
            ready: string;
            collected: string;
            expired: string;
            cancelled: string;
        };
        pickupWindowFormat: string;
        dateFormat: Intl.DateTimeFormatOptions;
        timeFormat: Intl.DateTimeFormatOptions;
    };
}

// Load messages based on locale
async function loadMessages(locale: SupportedLocale): Promise<PublicMessages> {
    try {
        const messages = (await import(`@/messages/public-${locale}.json`)).default;

        if (!messages || !messages.publicParcel) {
            throw new Error(`Invalid message structure for locale ${locale}`);
        }

        return messages as PublicMessages;
    } catch (error) {
        // Fallback to English if locale file doesn't exist
        logger.warn(
            {
                locale,
                error: error instanceof Error ? error.message : String(error),
            },
            "Locale-specific message bundle missing, falling back to English",
        );

        try {
            const fallbackMessages = (await import(`@/messages/public-en.json`)).default;

            if (!fallbackMessages || !fallbackMessages.publicParcel) {
                throw new Error("Invalid fallback message structure");
            }

            return fallbackMessages as PublicMessages;
        } catch (fallbackError) {
            logError("Failed to load fallback messages", fallbackError);
            // Ultimate fallback - return a minimal structure
            return {
                publicParcel: {
                    title: "Food Parcel Pickup",
                    pickupInfo: "Pickup Information",
                    location: "Location",
                    pickupWindow: "Pickup Time",
                    qrCodeLabel: "QR Code",
                    qrCodeDescription: "Show this QR code when picking up your food parcel",
                    mapsLabel: "Get Directions",
                    googleMaps: "Google Maps",
                    appleMaps: "Apple Maps",
                    status: {
                        scheduled: "Scheduled",
                        ready: "Ready for Pickup",
                        collected: "Collected",
                        expired: "Expired",
                        cancelled: "Cancelled",
                    },
                    statusDescription: {
                        scheduled:
                            "Your pickup is scheduled. Please arrive during the pickup window.",
                        ready: "Your food parcel is ready for pickup now!",
                        collected: "This food parcel has already been collected.",
                        expired:
                            "This pickup is no longer valid. Please contact staff if you have questions.",
                        cancelled: "This pickup has been cancelled. You do not need to come.",
                    },
                    pickupWindowFormat: "{startTime} - {endTime}",
                    dateFormat: {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    },
                    timeFormat: {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    },
                },
            } as PublicMessages;
        }
    }
}

// Format date and time for display
function formatPickupWindow(
    parcel: PublicParcelData,
    locale: SupportedLocale,
    messages: PublicMessages,
) {
    const startDate = new Date(parcel.pickupDateTimeEarliest);
    const endDate = new Date(parcel.pickupDateTimeLatest);

    // Convert to Stockholm timezone for display
    const startLocal = new Date(
        startDate.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }),
    );
    const endLocal = new Date(endDate.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));

    // Use message format options
    const dateFormatOptions = messages.publicParcel.dateFormat;
    const timeFormatOptions = messages.publicParcel.timeFormat;

    const dateStr = startLocal.toLocaleDateString(
        locale === "ar" ? "ar-SA" : locale,
        dateFormatOptions,
    );
    const startTimeStr = startLocal.toLocaleTimeString(
        locale === "ar" ? "ar-SA" : locale,
        timeFormatOptions,
    );
    const endTimeStr = endLocal.toLocaleTimeString(
        locale === "ar" ? "ar-SA" : locale,
        timeFormatOptions,
    );

    return {
        date: dateStr,
        timeWindow: messages.publicParcel.pickupWindowFormat
            .replace("{startTime}", startTimeStr)
            .replace("{endTime}", endTimeStr),
    };
}

// Get status badge color and text
function getStatusBadgeProps(status: ParcelStatus, messages: PublicMessages) {
    const statusMessages = messages.publicParcel.status;

    switch (status) {
        case "scheduled":
            return { color: "blue", text: statusMessages.scheduled };
        case "ready":
            return { color: "green", text: statusMessages.ready };
        case "collected":
            return { color: "gray", text: statusMessages.collected };
        case "expired":
            return { color: "red", text: statusMessages.expired };
        case "cancelled":
            return { color: "orange", text: statusMessages.cancelled };
        default:
            return { color: "gray", text: "Unknown" };
    }
}

export default async function PublicParcelPage({ params, searchParams }: PublicParcelPageProps) {
    const { parcelId } = await params;
    const resolvedSearchParams = (await searchParams) ?? {};
    const rawLocaleParam = resolvedSearchParams.lang;
    const localeParam = Array.isArray(rawLocaleParam) ? rawLocaleParam[0] : rawLocaleParam;

    // Fetch parcel data
    const parcel = await getPublicParcelData(parcelId);

    if (!parcel) {
        notFound();
    }

    // Detect locale
    const locale = await detectPublicPageLocale(parcel.householdLocale, localeParam);
    const isRtl = isRtlLocale(locale);

    // Load messages
    const messages = await loadMessages(locale);

    // Calculate status and formatting
    const status = getParcelStatus(parcel);
    const { date, timeWindow } = formatPickupWindow(parcel, locale, messages);
    const statusBadge = getStatusBadgeProps(status, messages);
    const mapsUrls = generateMapsUrls(
        parcel.locationName,
        parcel.locationAddress,
        parcel.locationPostalCode,
    );
    const adminUrl = generateAdminUrl(parcel.id);
    const languageOptions = SUPPORTED_LOCALES.map(value => ({
        value,
        label: value, // We'll use native names in the component
    }));
    const languageAriaLabel = messages.publicParcel.languageSelectorAriaLabel ?? "Choose language";
    const statusLabel = messages.publicParcel.statusLabel ?? "Status";
    const qrCodeDescriptionId = `parcel-${parcel.id}-qr-description`;
    const mapsLabel = messages.publicParcel.mapsLabel;
    const googleMapsAriaLabel = `${mapsLabel} – ${messages.publicParcel.googleMaps}`;
    const appleMapsAriaLabel = `${mapsLabel} – ${messages.publicParcel.appleMaps}`;

    return (
        <MantineProvider defaultColorScheme="light">
            <div
                dir={isRtl ? "rtl" : "ltr"}
                style={{
                    margin: 0,
                    padding: "16px",
                    backgroundColor: "#f8f9fa",
                    minHeight: "100vh",
                }}
            >
                <Stack gap="lg" maw={600} mx="auto">
                    <Stack gap="lg">
                        {/* Header with Language Selector */}
                        <Paper p="lg" radius="md" shadow="sm">
                            <Group justify="space-between" align="center" wrap="nowrap">
                                <div>
                                    <Title order={1} size="h2" mb="xs">
                                        {messages.publicParcel.title}
                                    </Title>
                                </div>
                                <Group gap="md" align="center">
                                    <Badge
                                        size="lg"
                                        variant="filled"
                                        color={statusBadge.color}
                                        aria-label={`${statusLabel}: ${statusBadge.text}`}
                                    >
                                        {statusBadge.text}
                                    </Badge>
                                    <PublicLocaleSwitcher
                                        ariaLabel={languageAriaLabel}
                                        currentValue={locale}
                                        options={languageOptions}
                                    />
                                </Group>
                            </Group>
                        </Paper>

                        {/* Status Description */}
                        <Paper
                            p="md"
                            radius="md"
                            bg={
                                status === "expired" || status === "cancelled"
                                    ? "red.0"
                                    : status === "ready"
                                      ? "green.0"
                                      : "blue.0"
                            }
                        >
                            <Text
                                size="sm"
                                c={
                                    status === "expired" || status === "cancelled"
                                        ? "red.7"
                                        : status === "ready"
                                          ? "green.7"
                                          : "blue.7"
                                }
                            >
                                {messages.publicParcel.statusDescription[status]}
                            </Text>
                        </Paper>

                        {/* Pickup Information */}
                        <Paper p="lg" radius="md" shadow="sm">
                            <Stack gap="md">
                                {/* Location with Maps */}
                                <Group gap="sm" align="flex-start" wrap="nowrap">
                                    <IconMapPin
                                        size={20}
                                        style={{ marginTop: 2, flexShrink: 0 }}
                                        aria-hidden="true"
                                    />
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                        <Text fw={500}>{messages.publicParcel.location}</Text>
                                        <Text size="sm" c="dark.6">
                                            {parcel.locationName}
                                        </Text>
                                        <Text size="sm" c="dark.6" mb="xs">
                                            {parcel.locationAddress}
                                        </Text>
                                        <Group gap="xs">
                                            <Button
                                                size="xs"
                                                variant="light"
                                                leftSection={
                                                    <IconExternalLink
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                }
                                                component="a"
                                                href={mapsUrls.google}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={googleMapsAriaLabel}
                                            >
                                                {messages.publicParcel.googleMaps}
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="light"
                                                leftSection={
                                                    <IconExternalLink
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                }
                                                component="a"
                                                href={mapsUrls.apple}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={appleMapsAriaLabel}
                                            >
                                                {messages.publicParcel.appleMaps}
                                            </Button>
                                        </Group>
                                    </Stack>
                                </Group>

                                <Divider />

                                {/* Pickup Time */}
                                <Group gap="sm" align="flex-start">
                                    <IconClock
                                        size={20}
                                        style={{ marginTop: 2, flexShrink: 0 }}
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <Text fw={500} mb={2}>
                                            {messages.publicParcel.pickupWindow}
                                        </Text>
                                        <Text size="sm" c="dark.6" mb={1}>
                                            {date}
                                        </Text>
                                        <Text size="sm" c="dark.6">
                                            {timeWindow}
                                        </Text>
                                    </div>
                                </Group>
                            </Stack>
                        </Paper>

                        {/* QR Code - Mobile First, Large and Centered */}
                        {status !== "expired" && status !== "cancelled" && (
                            <Paper p="lg" radius="md" shadow="sm">
                                <Stack gap="md" align="center">
                                    <QRCodeCanvas
                                        value={adminUrl}
                                        size={240}
                                        ariaLabel={messages.publicParcel.qrCodeLabel}
                                        ariaDescribedBy={qrCodeDescriptionId}
                                    />
                                    <Text
                                        id={qrCodeDescriptionId}
                                        size="sm"
                                        c="dark.6"
                                        ta="center"
                                        maw={280}
                                    >
                                        {messages.publicParcel.qrCodeDescription}
                                    </Text>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                </Stack>
            </div>
        </MantineProvider>
    );
}
