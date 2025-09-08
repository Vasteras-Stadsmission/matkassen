import { notFound } from "next/navigation";
import {
    getPublicParcelData,
    getParcelStatus,
    generateMapsUrls,
    generateAdminUrl,
    type PublicParcelData,
    type ParcelStatus,
} from "@/app/utils/public-parcel-data";
import {
    detectPublicPageLocale,
    isRtlLocale,
    type SupportedLocale,
} from "@/app/utils/locale-detection";
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

interface PublicParcelPageProps {
    params: {
        parcelId: string;
    };
}

// Load messages based on locale
async function loadMessages(locale: SupportedLocale) {
    try {
        return (await import(`@/messages/public-${locale}.json`)).default;
    } catch {
        // Fallback to English if locale file doesn't exist
        return (await import(`@/messages/public-en.json`)).default;
    }
}

// Format date and time for display
function formatPickupWindow(
    parcel: PublicParcelData,
    locale: SupportedLocale,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any,
) {
    const startDate = new Date(parcel.pickupDateTimeEarliest);
    const endDate = new Date(parcel.pickupDateTimeLatest);

    // Convert to Stockholm timezone for display
    const startLocal = new Date(
        startDate.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }),
    );
    const endLocal = new Date(endDate.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStatusBadgeProps(status: ParcelStatus, messages: any) {
    switch (status) {
        case "scheduled":
            return { color: "blue", text: messages.publicParcel.status.scheduled };
        case "ready":
            return { color: "green", text: messages.publicParcel.status.ready };
        case "collected":
            return { color: "gray", text: messages.publicParcel.status.collected };
        case "expired":
            return { color: "red", text: messages.publicParcel.status.expired };
        default:
            return { color: "gray", text: "Unknown" };
    }
}

export default async function PublicParcelPage({ params }: PublicParcelPageProps) {
    const { parcelId } = params;

    // Fetch parcel data
    const parcel = await getPublicParcelData(parcelId);

    if (!parcel) {
        notFound();
    }

    // Detect locale
    const locale = await detectPublicPageLocale(parcel.householdLocale);
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
                        {/* Header */}
                        <Paper p="lg" radius="md" shadow="sm">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <div>
                                    <Title order={1} size="h2" mb="xs">
                                        {messages.publicParcel.title}
                                    </Title>
                                    <Text size="lg" fw={500} c="dark.6">
                                        {parcel.householdName}
                                    </Text>
                                </div>
                                <Badge size="lg" variant="filled" color={statusBadge.color}>
                                    {statusBadge.text}
                                </Badge>
                            </Group>
                        </Paper>

                        {/* Status Description */}
                        <Paper
                            p="md"
                            radius="md"
                            bg={
                                status === "expired"
                                    ? "red.0"
                                    : status === "ready"
                                      ? "green.0"
                                      : "blue.0"
                            }
                        >
                            <Text
                                size="sm"
                                c={
                                    status === "expired"
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
                                    <IconMapPin size={20} style={{ marginTop: 2, flexShrink: 0 }} />
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
                                                leftSection={<IconExternalLink size={14} />}
                                                component="a"
                                                href={mapsUrls.google}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {messages.publicParcel.googleMaps}
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="light"
                                                leftSection={<IconExternalLink size={14} />}
                                                component="a"
                                                href={mapsUrls.apple}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {messages.publicParcel.appleMaps}
                                            </Button>
                                        </Group>
                                    </Stack>
                                </Group>

                                <Divider />

                                {/* Pickup Time */}
                                <Group gap="sm" align="flex-start">
                                    <IconClock size={20} style={{ marginTop: 2, flexShrink: 0 }} />
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
                        {status !== "expired" && (
                            <Paper p="lg" radius="md" shadow="sm">
                                <Stack gap="md" align="center">
                                    <QRCodeCanvas value={adminUrl} size={240} />
                                    <Text size="sm" c="dark.6" ta="center" maw={280}>
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
