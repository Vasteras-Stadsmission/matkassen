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
    Loader,
    Select,
} from "@mantine/core";
import { IconInfoCircle, IconTestPipe } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { notifications } from "@mantine/notifications";
import SmsManagementPanel from "@/app/[locale]/schedule/components/SmsManagementPanel";
import { useSmsManagement } from "@/app/[locale]/schedule/hooks/useSmsManagement";
import { SmsRecord } from "@/app/utils/sms/sms-service";

interface FoodParcel {
    id: string;
    householdId: string;
    householdName: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
    isPickedUp: boolean;
}

export default function SmsManagementDemo() {
    const [smsHistory, setSmsHistory] = useState<SmsRecord[]>([]);
    const [availableParcels, setAvailableParcels] = useState<FoodParcel[]>([]);
    const [selectedParcel, setSelectedParcel] = useState<FoodParcel | null>(null);
    const [isLoadingParcels, setIsLoadingParcels] = useState(true);
    const [testMode, setTestMode] = useState(false);
    const { sendSms, resendSms, isLoading } = useSmsManagement();

    // Fetch available parcels on component mount
    useEffect(() => {
        const fetchParcels = async () => {
            try {
                const response = await fetch("/api/admin/parcels/upcoming");
                if (response.ok) {
                    const rawParcels = await response.json();
                    // Convert date strings to Date objects
                    const parcels = rawParcels.map(
                        (parcel: {
                            id: string;
                            householdId: string;
                            householdName: string;
                            pickupDate: string;
                            pickupEarliestTime: string;
                            pickupLatestTime: string;
                            isPickedUp: boolean;
                        }) => ({
                            ...parcel,
                            pickupDate: new Date(parcel.pickupDate),
                            pickupEarliestTime: new Date(parcel.pickupEarliestTime),
                            pickupLatestTime: new Date(parcel.pickupLatestTime),
                        }),
                    );
                    setAvailableParcels(parcels);
                    if (parcels.length > 0) {
                        setSelectedParcel(parcels[0]); // Select first parcel by default
                    }
                }
            } catch (error) {
                console.error("Failed to fetch parcels:", error);
            } finally {
                setIsLoadingParcels(false);
            }
        };
        fetchParcels();
    }, []);

    // Load SMS history when selected parcel changes
    useEffect(() => {
        if (selectedParcel) {
            const fetchSmsData = async () => {
                try {
                    console.log("🔍 Fetching SMS data for parcel:", selectedParcel.id);
                    const response = await fetch(`/api/admin/sms/parcel/${selectedParcel.id}`);
                    if (response.ok) {
                        const data = await response.json();
                        setSmsHistory(data.smsRecords || []);
                        setTestMode(data.testMode || false);
                    }
                } catch (error) {
                    console.error("Failed to fetch SMS data:", error);
                }
            };
            fetchSmsData();
        }
    }, [selectedParcel]);

    const handleSendSms = async (parcelId: string) => {
        console.log(`Demo: Sending SMS for parcel ${parcelId}`);
        const success = await sendSms(parcelId);
        if (success && selectedParcel) {
            // Add a small delay to ensure database is updated
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refresh history and test mode
            try {
                const response = await fetch(`/api/admin/sms/parcel/${selectedParcel.id}`);
                if (response.ok) {
                    const data = await response.json();
                    setSmsHistory(data.smsRecords || []);
                    setTestMode(data.testMode || false);
                }
            } catch (error) {
                console.error("Failed to refresh SMS data:", error);
            }
        }
    };

    const handleTestFailure = async (failureType: string) => {
        console.log(`🧪 Testing ${failureType} scenario...`);
        if (!selectedParcel) {
            console.log("No parcel selected");
            return;
        }

        try {
            // Call the API directly for failure injection since useSmsManagement doesn't support it
            const response = await fetch(`/api/admin/sms/parcel/${selectedParcel.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "send",
                    forceFailure: failureType,
                }),
            });

            const result = await response.json();
            console.log(`${failureType} test result:`, result);

            // Manually trigger the same error handling as useSmsManagement
            if (!response.ok) {
                console.log(`✅ ${failureType} injection successful:`, result.error);

                // Show appropriate notification based on status code
                if (response.status === 429) {
                    notifications.show({
                        title: "Rate Limited",
                        message: result.error || "Please wait before sending another SMS",
                        color: "yellow",
                        autoClose: 7000,
                    });
                } else {
                    notifications.show({
                        title: "SMS Send Error",
                        message: result.error || "Failed to send SMS",
                        color: "red",
                    });
                }
            }

            // Refresh SMS data
            const refreshResponse = await fetch(`/api/admin/sms/parcel/${selectedParcel.id}`);
            if (refreshResponse.ok) {
                const data = await refreshResponse.json();
                setSmsHistory(data.smsRecords || []);
                setTestMode(data.testMode || false);
            }
        } catch (error) {
            console.error(`Failed to test ${failureType} scenario:`, error);
            notifications.show({
                title: "Test Error",
                message: `Failed to test ${failureType} scenario`,
                color: "red",
            });
        }
    };

    const handleResendSms = async (parcelId: string) => {
        if (!selectedParcel) return;
        console.log(`Demo: Resending SMS for parcel ${parcelId}`);
        const success = await resendSms(parcelId);
        if (success) {
            // Add a small delay to ensure database is updated
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refresh history and test mode
            try {
                const response = await fetch(`/api/admin/sms/parcel/${parcelId}`);
                if (response.ok) {
                    const data = await response.json();
                    setSmsHistory(data.smsRecords || []);
                    setTestMode(data.testMode || false);
                }
            } catch (error) {
                console.error("Failed to refresh SMS data:", error);
            }
        }
    };

    if (isLoadingParcels) {
        return (
            <Container size="md">
                <Group justify="center" mt="xl">
                    <Loader size="lg" />
                    <Text>Loading upcoming food parcels...</Text>
                </Group>
            </Container>
        );
    }

    if (availableParcels.length === 0) {
        return (
            <Container size="md">
                <Stack gap="xl">
                    <div>
                        <Title order={1} mb="md">
                            SMS Management Demo
                        </Title>
                        <Text c="dimmed">Test the SMS notification system with real data.</Text>
                    </div>

                    <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
                        <Stack gap="xs">
                            <Text fw={500}>No Upcoming Food Parcels Found</Text>
                            <Text size="sm">
                                To test the SMS feature, you need upcoming food parcels in the
                                database. Create some parcels in the schedule page first, or run the
                                test data script.
                            </Text>
                        </Stack>
                    </Alert>

                    <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                        <Stack gap="xs">
                            <Text fw={500}>Quick Setup</Text>
                            <Text size="sm">
                                Test parcels have been created for you! Refresh this page to see
                                them.
                            </Text>
                        </Stack>
                    </Alert>
                </Stack>
            </Container>
        );
    }

    return (
        <Container size="md">
            <Stack gap="xl">
                <div>
                    <Title order={1} mb="md">
                        SMS Management Demo
                    </Title>
                    <Text c="dimmed">
                        Test the SMS notification system with real data. All SMS messages will be
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

                {availableParcels.length > 1 && (
                    <Card withBorder>
                        <Stack gap="md">
                            <Text fw={500}>Select Food Parcel to Test</Text>
                            <Select
                                data={availableParcels.map(parcel => ({
                                    value: parcel.id,
                                    label: `${parcel.householdName} - ${parcel.pickupDate.toLocaleDateString()} ${parcel.pickupEarliestTime.toLocaleTimeString()}`,
                                }))}
                                value={selectedParcel?.id || ""}
                                onChange={value => {
                                    const parcel = availableParcels.find(p => p.id === value);
                                    setSelectedParcel(parcel || null);
                                }}
                                placeholder="Select a parcel"
                            />
                        </Stack>
                    </Card>
                )}

                {selectedParcel && (
                    <Card withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" align="center">
                                <div>
                                    <Text fw={500} size="lg">
                                        Food Parcel #{selectedParcel.id.slice(-6)}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Household: {selectedParcel.householdName}
                                    </Text>
                                </div>
                                <Badge color="green" variant="light">
                                    Real Data
                                </Badge>
                            </Group>

                            <Group>
                                <Text size="sm">
                                    <strong>Pickup Date:</strong>{" "}
                                    {selectedParcel.pickupDate.toLocaleDateString()}
                                </Text>
                                <Text size="sm">
                                    <strong>Time Window:</strong>{" "}
                                    {selectedParcel.pickupEarliestTime.toLocaleTimeString()} -{" "}
                                    {selectedParcel.pickupLatestTime.toLocaleTimeString()}
                                </Text>
                            </Group>

                            <Divider />

                            <SmsManagementPanel
                                parcel={selectedParcel}
                                smsHistory={smsHistory}
                                onSendSms={handleSendSms}
                                onResendSms={handleResendSms}
                                isLoading={isLoading}
                                testMode={testMode}
                            />
                        </Stack>
                    </Card>
                )}

                <Card withBorder>
                    <Stack gap="md">
                        <Group align="center">
                            <IconTestPipe size={20} />
                            <Text fw={500}>Test Controls</Text>
                        </Group>

                        <Text size="sm" c="dimmed">
                            Use these buttons to test different SMS scenarios and error conditions.
                            Failure injection only works in test mode.
                        </Text>

                        <Group>
                            <Button
                                size="sm"
                                variant="light"
                                color="red"
                                onClick={() => handleTestFailure("api_error")}
                            >
                                Test API Error
                            </Button>
                            <Button
                                size="sm"
                                variant="light"
                                color="orange"
                                onClick={() => handleTestFailure("rate_limit")}
                            >
                                Test Rate Limit
                            </Button>
                            <Button
                                size="sm"
                                variant="light"
                                color="green"
                                onClick={async () => {
                                    console.log("Testing success scenario...");
                                    if (!selectedParcel) {
                                        console.log("No parcel selected");
                                        return;
                                    }

                                    try {
                                        // Send a manual SMS (normal flow)
                                        await handleSendSms(selectedParcel.id);
                                        console.log("Success test completed - SMS sent normally");
                                    } catch (error) {
                                        console.error("Failed to test success scenario:", error);
                                    }
                                }}
                            >
                                Test Success Scenario
                            </Button>{" "}
                            <Button
                                size="sm"
                                variant="light"
                                color="blue"
                                onClick={async () => {
                                    try {
                                        console.log("Processing SMS queue...");
                                        const response = await fetch(
                                            "/api/admin/sms/process-queue",
                                            {
                                                method: "POST",
                                            },
                                        );
                                        const result = await response.json();
                                        console.log("SMS queue processing result:", result);

                                        // Refresh SMS history and test mode for selected parcel
                                        if (selectedParcel) {
                                            const refreshResponse = await fetch(
                                                `/api/admin/sms/parcel/${selectedParcel.id}`,
                                            );
                                            if (refreshResponse.ok) {
                                                const data = await refreshResponse.json();
                                                setSmsHistory(data.smsRecords || []);
                                                setTestMode(data.testMode || false);
                                            }
                                        }
                                    } catch (error) {
                                        console.error("Failed to process SMS queue:", error);
                                    }
                                }}
                            >
                                Process SMS Queue
                            </Button>
                        </Group>
                    </Stack>
                </Card>

                <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
                    <Text size="sm">
                        <strong>Environment Variables Required:</strong>
                        <br />
                        Make sure you have HELLO_SMS_USERNAME, HELLO_SMS_PASSWORD, and
                        HELLO_SMS_TEST_MODE=true configured in your environment.
                    </Text>
                </Alert>
            </Stack>
        </Container>
    );
}
