"use client";

import {
    Container,
    Title,
    Text,
    Card,
    Group,
    Stack,
    Button,
    Alert,
    Badge,
    Divider,
} from "@mantine/core";
import { IconInfoCircle, IconTestPipe } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import SmsManagementPanel from "@/app/[locale]/schedule/components/SmsManagementPanel";
import { useSmsManagement } from "@/app/[locale]/schedule/hooks/useSmsManagement";

interface SmsRecord {
    id: string;
    intent: "initial" | "reminder" | "manual";
    status: "pending" | "sent" | "delivered" | "failed" | "cancelled";
    sentAt?: Date;
    deliveredAt?: Date;
    failureReason?: string;
    retryCount: number;
}

// Mock food parcel data for demo
const mockParcel = {
    id: "demo-parcel-001",
    householdId: "demo-household-001",
    householdName: "Demo Household",
    pickupDate: new Date(),
    pickupEarliestTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    pickupLatestTime: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
    isPickedUp: false,
};

export default function SmsManagementDemo() {
    const [smsHistory, setSmsHistory] = useState<SmsRecord[]>([]);
    const { sendSms, resendSms, fetchSmsHistory, isLoading } = useSmsManagement();

    useEffect(() => {
        // Load initial SMS history for the demo parcel
        fetchSmsHistory(mockParcel.id).then(setSmsHistory);
    }, [fetchSmsHistory]);

    const handleSendSms = async (parcelId: string, intent: "initial" | "reminder" | "manual") => {
        console.log(`Demo: Sending ${intent} SMS for parcel ${parcelId}`);
        const success = await sendSms(parcelId, intent);
        if (success) {
            // Refresh history
            const newHistory = await fetchSmsHistory(parcelId);
            setSmsHistory(newHistory);
        }
    };

    const handleResendSms = async (smsId: string) => {
        console.log(`Demo: Resending SMS ${smsId} for parcel ${mockParcel.id}`);
        const success = await resendSms(smsId);
        if (success) {
            // Refresh history
            const newHistory = await fetchSmsHistory(mockParcel.id);
            setSmsHistory(newHistory);
        }
    };

    return (
        <Container size="md">
            <Stack gap="xl">
                <div>
                    <Title order={1} mb="md">
                        SMS Management Demo
                    </Title>
                    <Text c="dimmed">
                        Test the SMS notification system with demo data. All SMS messages will be
                        sent in test mode.
                    </Text>
                </div>

                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    <Stack gap="xs">
                        <Text fw={500}>Test Mode Information</Text>
                        <Text size="sm">
                            • SMS messages are sent to HelloSMS in test mode • Real phone numbers
                            will not receive messages • Test failure injection is available for
                            error testing • All messages are logged for debugging
                        </Text>
                    </Stack>
                </Alert>

                <Card withBorder>
                    <Stack gap="md">
                        <Group justify="space-between" align="center">
                            <div>
                                <Text fw={500} size="lg">
                                    Demo Food Parcel
                                </Text>
                                <Text size="sm" c="dimmed">
                                    Household: {mockParcel.householdName}
                                </Text>
                            </div>
                            <Badge color="blue" variant="light">
                                Demo Data
                            </Badge>
                        </Group>

                        <Group>
                            <Text size="sm">
                                <strong>Pickup Date:</strong>{" "}
                                {mockParcel.pickupDate.toLocaleDateString()}
                            </Text>
                            <Text size="sm">
                                <strong>Time Window:</strong>{" "}
                                {mockParcel.pickupEarliestTime.toLocaleTimeString()} -{" "}
                                {mockParcel.pickupLatestTime.toLocaleTimeString()}
                            </Text>
                        </Group>

                        <Divider />

                        <SmsManagementPanel
                            parcel={mockParcel}
                            smsHistory={smsHistory}
                            onSendSms={handleSendSms}
                            onResendSms={handleResendSms}
                            isLoading={isLoading}
                        />
                    </Stack>
                </Card>

                <Card withBorder>
                    <Stack gap="md">
                        <Group align="center">
                            <IconTestPipe size={20} />
                            <Text fw={500}>Test Controls</Text>
                        </Group>

                        <Text size="sm" c="dimmed">
                            Use these buttons to test different SMS scenarios and error conditions.
                        </Text>

                        <Group>
                            <Button
                                size="sm"
                                variant="light"
                                color="orange"
                                onClick={() => {
                                    console.log("Testing failure injection...");
                                    // You can add test failure scenarios here
                                }}
                            >
                                Test Failure Scenario
                            </Button>

                            <Button
                                size="sm"
                                variant="light"
                                color="green"
                                onClick={() => {
                                    console.log("Testing success scenario...");
                                    // You can add test success scenarios here
                                }}
                            >
                                Test Success Scenario
                            </Button>
                        </Group>
                    </Stack>
                </Card>

                <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
                    <Text size="sm">
                        <strong>Environment Variables Required:</strong>
                        <br />
                        Make sure you have HELLOSMS_API_KEY, HELLOSMS_FROM_NUMBER, and
                        HELLOSMS_TEST_MODE=true configured in your environment.
                    </Text>
                </Alert>
            </Stack>
        </Container>
    );
}
