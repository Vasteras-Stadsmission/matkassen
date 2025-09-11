"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
    value: string;
    size?: number;
    className?: string;
}

export function QRCodeCanvas({ value, size = 200, className }: QRCodeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current && value) {
            QRCodeLib.toCanvas(canvasRef.current, value, {
                width: size,
                margin: 2,
                color: {
                    dark: "#000000",
                    light: "#FFFFFF",
                },
            }).catch(console.error);
        }
    }, [value, size]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{ maxWidth: "100%", height: "auto" }}
        />
    );
}
