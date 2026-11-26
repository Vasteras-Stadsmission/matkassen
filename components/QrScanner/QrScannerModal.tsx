"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Box, Loader, Modal, Stack, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { IconAlertCircle } from "@tabler/icons-react";
import type { TranslationFunction } from "@/app/[locale]/types";
import { parseParcelIdFromQr } from "./parse-parcel-qr";

type CameraError = "permissionDenied" | "noCamera" | "unsupported" | "cameraError";

// jsQR runs on the main thread, so scan a downscaled frame a few times a second.
const SCAN_INTERVAL_MS = 150;
const MAX_FRAME_WIDTH = 640;
const NOT_PARCEL_HIDE_MS = 3000;

interface QrScannerModalProps {
    opened: boolean;
    onClose: () => void;
    onScan: (parcelId: string) => void;
}

/**
 * Camera scanner for the QR code on a recipient's parcel page. Closes itself
 * and calls onScan with the parcel id.
 */
export function QrScannerModal({ opened, onClose, onScan }: QrScannerModalProps) {
    const t = useTranslations("qrScanner") as TranslationFunction;
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t("title")}
            fullScreen={isMobile}
            size="lg"
            zIndex={1100}
        >
            {/* Modal unmounts its children when closed, which stops the camera */}
            <Scanner
                onScan={parcelId => {
                    onClose();
                    onScan(parcelId);
                }}
            />
        </Modal>
    );
}

function Scanner({ onScan }: { onScan: (parcelId: string) => void }) {
    const t = useTranslations("qrScanner") as TranslationFunction;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [starting, setStarting] = useState(true);
    const [cameraError, setCameraError] = useState<CameraError | null>(null);
    const [notParcel, setNotParcel] = useState(false);

    // Keep the latest callback without restarting the camera when it changes
    const onScanRef = useRef(onScan);
    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        let cancelled = false;
        let stream: MediaStream | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let notParcelTimer: ReturnType<typeof setTimeout> | undefined;
        const stopCamera = () => stream?.getTracks().forEach(track => track.stop());

        async function start() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError("unsupported");
                return;
            }
            try {
                // Load the decoder before asking for the camera, so a failed load never
                // leaves a camera running
                const { default: jsQR } = await import("jsqr");
                if (cancelled) return;
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });
                // Closed while the permission prompt was open: cleanup has already run
                if (cancelled) {
                    stopCamera();
                    return;
                }

                const video = videoRef.current!;
                video.srcObject = stream;
                await video.play();
                if (cancelled) return;
                setStarting(false);

                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { willReadFrequently: true })!;

                const scanFrame = () => {
                    if (cancelled) return;
                    if (video.videoWidth > 0) {
                        const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
                        const width = Math.round(video.videoWidth * scale);
                        const height = Math.round(video.videoHeight * scale);
                        // Resizing clears and reallocates the canvas, so only do it on change
                        if (canvas.width !== width || canvas.height !== height) {
                            canvas.width = width;
                            canvas.height = height;
                        }
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(frame.data, frame.width, frame.height, {
                            inversionAttempts: "dontInvert",
                        });
                        if (code) {
                            const parcelId = parseParcelIdFromQr(code.data);
                            if (parcelId) {
                                onScanRef.current(parcelId);
                                return;
                            }
                            // Hide the warning a while after the other code leaves the frame
                            setNotParcel(true);
                            clearTimeout(notParcelTimer);
                            notParcelTimer = setTimeout(
                                () => setNotParcel(false),
                                NOT_PARCEL_HIDE_MS,
                            );
                        }
                    }
                    timer = setTimeout(scanFrame, SCAN_INTERVAL_MS);
                };
                scanFrame();
            } catch (error) {
                stopCamera();
                if (cancelled) return;
                const name = error instanceof DOMException ? error.name : "";
                if (name === "NotAllowedError" || name === "SecurityError") {
                    setCameraError("permissionDenied");
                } else if (name === "NotFoundError" || name === "OverconstrainedError") {
                    setCameraError("noCamera");
                } else {
                    setCameraError("cameraError");
                }
            }
        }

        start();

        return () => {
            cancelled = true;
            clearTimeout(timer);
            clearTimeout(notParcelTimer);
            stopCamera();
        };
    }, []);

    if (cameraError) {
        return (
            <Alert color="red" icon={<IconAlertCircle size={20} />} data-testid="qr-scanner-error">
                {t(cameraError)}
            </Alert>
        );
    }

    return (
        <Stack gap="sm">
            <Box
                pos="relative"
                style={{
                    borderRadius: "var(--mantine-radius-md)",
                    overflow: "hidden",
                    background: "var(--mantine-color-dark-7)",
                    aspectRatio: "4 / 3",
                }}
            >
                <video
                    ref={videoRef}
                    muted
                    playsInline
                    data-testid="qr-scanner-video"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {starting ? (
                    <Stack pos="absolute" inset={0} align="center" justify="center" gap="xs">
                        <Loader color="white" size="sm" />
                        <Text c="white" size="sm">
                            {t("starting")}
                        </Text>
                    </Stack>
                ) : (
                    <Box
                        pos="absolute"
                        top="50%"
                        left="50%"
                        style={{
                            width: "60%",
                            aspectRatio: "1",
                            maxHeight: "80%",
                            transform: "translate(-50%, -50%)",
                            border: "3px solid white",
                            borderRadius: "var(--mantine-radius-md)",
                            boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.35)",
                        }}
                    />
                )}
            </Box>
            <Text size="sm" c="dimmed" ta="center">
                {t("hint")}
            </Text>
            {notParcel && (
                <Alert color="orange" icon={<IconAlertCircle size={20} />} p="xs">
                    {t("notParcel")}
                </Alert>
            )}
        </Stack>
    );
}
