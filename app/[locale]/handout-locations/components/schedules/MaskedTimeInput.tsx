"use client";

import { useRef, useState, useEffect, useCallback, KeyboardEvent } from "react";
import { Input, InputProps, Popover, Stack, Button } from "@mantine/core";

// Valid minute values (quarters of an hour)
const VALID_MINUTES = ["00", "15", "30", "45"];

interface MaskedTimeInputProps extends Omit<InputProps, "onChange" | "value"> {
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
}

export function MaskedTimeInput({
    value = "09:00",
    onChange,
    disabled = false,
    ...props
}: MaskedTimeInputProps) {
    // Store the internal input value as a single state to avoid dependency loops
    const [timeValue, setTimeValue] = useState(value);

    // Reference to input element for focus management
    const inputRef = useRef<HTMLInputElement>(null);

    // Track which part is being edited and cursor position
    const [isEditingHours, setIsEditingHours] = useState(true);
    const [cursorPosition, setCursorPosition] = useState(0);

    // For showing suggestions dropdown
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isValid, setIsValid] = useState(true);

    // To prevent infinite update loops
    const skipUpdate = useRef(false);

    // Parse the current hours and minutes
    const [hours, minutes] = timeValue.split(":");

    // Validate the time
    const isValidTime = useCallback((hours: string, minutes: string): boolean => {
        const h = parseInt(hours, 10);
        return !isNaN(h) && h >= 0 && h <= 23 && VALID_MINUTES.includes(minutes);
    }, []);

    // Update from external value changes
    useEffect(() => {
        if (value !== timeValue && !skipUpdate.current) {
            setTimeValue(value);
        }
        skipUpdate.current = false;
    }, [value, timeValue]);

    // Handle update of hours
    const updateHours = useCallback(
        (newHours: string) => {
            skipUpdate.current = true;
            const hourNum = parseInt(newHours, 10);

            // If it's a valid hour, update
            if (!isNaN(hourNum) && hourNum >= 0 && hourNum <= 23) {
                const formattedHours = hourNum.toString().padStart(2, "0");
                const newValue = `${formattedHours}:${minutes}`;
                setTimeValue(newValue);
                if (onChange && isValidTime(formattedHours, minutes)) {
                    onChange(newValue);
                }
            }
        },
        [minutes, onChange, isValidTime],
    );

    // Handle update of minutes
    const updateMinutes = useCallback(
        (newMinutes: string) => {
            skipUpdate.current = true;

            // Check if the minutes value is valid
            if (VALID_MINUTES.includes(newMinutes)) {
                const newValue = `${hours}:${newMinutes}`;
                setTimeValue(newValue);
                if (onChange && isValidTime(hours, newMinutes)) {
                    onChange(newValue);
                }
            }
        },
        [hours, onChange, isValidTime],
    );

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value.replace(/[^0-9:]/g, "");

        // Get cursor position
        const newCursorPos = e.target.selectionStart || 0;
        setCursorPosition(newCursorPos);

        // Determine if editing hours or minutes
        const colonPosition = inputValue.indexOf(":");
        setIsEditingHours(colonPosition === -1 || newCursorPos <= colonPosition);

        // Split the input
        const parts = inputValue.split(":");

        if (parts.length === 1) {
            // User is editing hours only
            const hoursPart = parts[0];
            if (hoursPart.length <= 2) {
                updateHours(hoursPart);
            }
        } else if (parts.length === 2) {
            // User edited both parts
            const [hoursPart, minutesPart] = parts;

            if (hoursPart.length <= 2) {
                updateHours(hoursPart);
            }

            if (minutesPart.length <= 2) {
                // For minutes, we need to check if this is a valid minute
                if (minutesPart.length > 0) {
                    // Show suggestions when typing minutes
                    setShowSuggestions(true);

                    // Find closest valid minute while typing
                    const minuteNum = parseInt(minutesPart, 10);
                    let validMinute = false;

                    if (!isNaN(minuteNum)) {
                        validMinute = VALID_MINUTES.includes(minutesPart.padStart(2, "0"));
                        setIsValid(validMinute);
                    }

                    // Update the display value even if invalid
                    skipUpdate.current = true;
                    setTimeValue(`${hours}:${minutesPart.padStart(2, "0")}`);

                    // Only update parent if valid
                    if (validMinute && onChange) {
                        onChange(`${hours}:${minutesPart.padStart(2, "0")}`);
                    }
                }
            }
        }
    };

    // Handle key events (arrows, tab, etc)
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === ":") {
            // When typing colon, move to minutes
            e.preventDefault();
            setIsEditingHours(false);
            if (inputRef.current) {
                inputRef.current.setSelectionRange(3, 5);
            }
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();

            if (isEditingHours) {
                // Increment/decrement hours
                const hourNum = parseInt(hours, 10) || 0;
                let newHour;

                if (e.key === "ArrowUp") {
                    newHour = (hourNum + 1) % 24;
                } else {
                    newHour = (hourNum + 23) % 24;
                }

                updateHours(newHour.toString());
            } else {
                // Increment/decrement minutes by valid values
                const currentMinuteIndex = VALID_MINUTES.indexOf(minutes);
                let newIndex;

                if (e.key === "ArrowUp") {
                    newIndex = (currentMinuteIndex + 1) % VALID_MINUTES.length;
                } else {
                    newIndex =
                        (currentMinuteIndex - 1 + VALID_MINUTES.length) % VALID_MINUTES.length;
                }

                updateMinutes(VALID_MINUTES[newIndex]);
            }
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            // Handle left/right arrows to navigate between hours/minutes
            const colonPosition = 2; // Always at position 2

            if (e.key === "ArrowLeft" && cursorPosition <= colonPosition + 1) {
                setIsEditingHours(true);
                setTimeout(() => {
                    inputRef.current?.setSelectionRange(0, 2);
                }, 0);
            } else if (e.key === "ArrowRight" && cursorPosition >= colonPosition - 1) {
                setIsEditingHours(false);
                setTimeout(() => {
                    inputRef.current?.setSelectionRange(3, 5);
                }, 0);
            }
        } else if (e.key === "Tab") {
            // Handle tab key to move between hours and minutes
            if (isEditingHours && !e.shiftKey) {
                e.preventDefault();
                setIsEditingHours(false);
                setTimeout(() => {
                    inputRef.current?.setSelectionRange(3, 5);
                }, 0);
            }
        }
    };

    // Handle focus
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Select the appropriate part
        setTimeout(() => {
            if (isEditingHours) {
                e.target.setSelectionRange(0, 2);
            } else {
                e.target.setSelectionRange(3, 5);
            }
        }, 0);
    };

    // Handle clicking to determine which part to edit
    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
        const clickPosition = e.currentTarget.selectionStart || 0;
        const colonPosition = e.currentTarget.value.indexOf(":");

        setIsEditingHours(clickPosition <= colonPosition);
        setCursorPosition(clickPosition);
    };

    // Handle selecting a minute from suggestions
    const handleSelectMinute = (minute: string) => {
        updateMinutes(minute);
        setShowSuggestions(false);

        // Focus back on input
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(3, 5);
        }
    };

    // When input loses focus, correct if needed
    const handleBlur = () => {
        const [currentHours, currentMinutes] = timeValue.split(":");
        let needsUpdate = false;
        let newHours = currentHours;
        let newMinutes = currentMinutes;

        // Fix hours if needed
        const hourNum = parseInt(currentHours, 10);
        if (!isNaN(hourNum)) {
            if (hourNum < 0 || hourNum > 23) {
                newHours = (hourNum % 24).toString().padStart(2, "0");
                needsUpdate = true;
            } else if (currentHours.length === 1) {
                newHours = currentHours.padStart(2, "0");
                needsUpdate = true;
            }
        } else {
            newHours = "00";
            needsUpdate = true;
        }

        // Fix minutes if needed
        if (!VALID_MINUTES.includes(currentMinutes)) {
            const minuteNum = parseInt(currentMinutes, 10) || 0;

            // Find the closest valid minute
            const closestMinute = VALID_MINUTES.reduce((prev, curr) => {
                const prevDiff = Math.abs(parseInt(prev, 10) - minuteNum);
                const currDiff = Math.abs(parseInt(curr, 10) - minuteNum);
                return currDiff < prevDiff ? curr : prev;
            });

            newMinutes = closestMinute;
            needsUpdate = true;
        }

        // Update if corrections were made
        if (needsUpdate) {
            const newValue = `${newHours}:${newMinutes}`;
            skipUpdate.current = true;
            setTimeValue(newValue);

            if (onChange && isValidTime(newHours, newMinutes)) {
                onChange(newValue);
            }
        }

        // Always hide suggestions
        setShowSuggestions(false);
    };

    return (
        <Popover
            opened={showSuggestions && !disabled}
            position="bottom"
            width="target"
            withinPortal
            transitionProps={{ transition: "pop" }}
            onClose={() => setShowSuggestions(false)}
        >
            <Popover.Target>
                <Input
                    ref={inputRef}
                    {...props}
                    value={timeValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onClick={handleClick}
                    onBlur={handleBlur}
                    disabled={disabled}
                    error={!isValid}
                />
            </Popover.Target>

            <Popover.Dropdown>
                <Stack gap="xs">
                    {VALID_MINUTES.map(minute => (
                        <Button
                            key={minute}
                            variant="subtle"
                            size="compact-sm"
                            onClick={() => handleSelectMinute(minute)}
                        >
                            {minute}
                        </Button>
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
}
