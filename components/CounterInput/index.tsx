import React from "react";
import { Group, NumberInput, ActionIcon } from "@mantine/core";
import { IconPlus, IconMinus } from "@tabler/icons-react";

interface CounterInputProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    inputWidth?: string | number;
    disabled?: boolean;
}

export function CounterInput({
    value,
    onChange,
    min = 0,
    max = 99,
    size = "md",
    inputWidth = "60px",
    disabled = false,
}: CounterInputProps) {
    // Use a ref to track the latest value to ensure proper sequential updates
    const valueRef = React.useRef(value);

    // Keep the ref in sync with the prop value
    React.useEffect(() => {
        valueRef.current = value;
    }, [value]);

    const increment = () => {
        // Use the ref value as the most up-to-date value
        const newValue = Math.min(valueRef.current + 1, max);
        if (newValue !== valueRef.current) {
            onChange(newValue);
        }
    };

    const decrement = () => {
        // Use the ref value as the most up-to-date value
        const newValue = Math.max(valueRef.current - 1, min);
        if (newValue !== valueRef.current) {
            onChange(newValue);
        }
    };

    const actionIconSize = size === "xs" ? "sm" : size === "sm" ? "md" : "lg";
    const iconSize = size === "xs" ? "0.8rem" : size === "sm" ? "0.9rem" : "1rem";

    return (
        <Group spacing="xs">
            <ActionIcon
                color="gray"
                variant="light"
                onClick={decrement}
                size={actionIconSize}
                radius="md"
                disabled={disabled || value <= min}
            >
                <IconMinus size={iconSize} />
            </ActionIcon>

            <NumberInput
                value={value}
                onChange={val => onChange(val as number)}
                min={min}
                max={max}
                hideControls
                disabled={disabled}
                styles={{
                    input: {
                        width: inputWidth,
                        textAlign: "center",
                        fontSize: size === "xs" ? "0.8rem" : size === "sm" ? "0.9rem" : "1rem",
                    },
                }}
            />

            <ActionIcon
                color="blue"
                variant="light"
                onClick={increment}
                size={actionIconSize}
                radius="md"
                disabled={disabled || value >= max}
            >
                <IconPlus size={iconSize} />
            </ActionIcon>
        </Group>
    );
}

export default CounterInput;
