import React, { ReactNode } from "react";
import { FoodParcel } from "../../../app/[locale]/schedule/types";

// Common Mock Components for Schedule Tests

/**
 * Mock Mantine Paper component
 */
export interface MockPaperProps {
    children: ReactNode;
    bg?: string;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
    [key: string]: any;
}

export const MockPaper = ({ children, bg, style = {}, ...props }: MockPaperProps) => (
    <div
        data-testid="paper"
        data-bg={bg} // Store the bg color as a data attribute for testing
        style={{ ...style }}
        {...props}
    >
        {children}
    </div>
);

/**
 * Mock Mantine Stack component
 */
export interface MockStackProps {
    children: ReactNode;
    [key: string]: any;
}

export const MockStack = ({ children, ...props }: MockStackProps) => (
    <div data-testid="stack" {...props}>
        {children}
    </div>
);

/**
 * Mock Mantine Group component
 */
export interface MockGroupProps {
    children: ReactNode;
    [key: string]: any;
}

export const MockGroup = ({ children, ...props }: MockGroupProps) => (
    <div data-testid="group" {...props}>
        {children}
    </div>
);

/**
 * Mock Mantine Box component
 */
export interface MockBoxProps {
    children: ReactNode;
    [key: string]: any;
}

export const MockBox = ({ children, ...props }: MockBoxProps) => (
    <div data-testid="box" {...props}>
        {children}
    </div>
);

/**
 * Mock Mantine Text component
 */
export interface MockTextProps {
    children: ReactNode;
    size?: string;
    weight?: string;
    color?: string;
    [key: string]: any;
}

export const MockText = ({ children, size, weight, color, ...props }: MockTextProps) => (
    <div data-testid="text" data-size={size} data-weight={weight} data-color={color} {...props}>
        {children}
    </div>
);

/**
 * Mock Mantine Button component
 */
export interface MockButtonProps {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    color?: string;
    variant?: string;
    [key: string]: any;
}

export const MockButton = ({
    children,
    onClick,
    disabled = false,
    color,
    variant,
    ...props
}: MockButtonProps) => (
    <button
        data-testid="button"
        data-color={color}
        data-variant={variant}
        onClick={onClick}
        disabled={disabled}
        {...props}
    >
        {children}
    </button>
);

/**
 * Mock PickupCard component
 */
export interface MockPickupCardProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
}

export const MockPickupCard = ({ foodParcel, isCompact }: MockPickupCardProps) => (
    <div data-testid={`pickup-card-${foodParcel.id}`} data-compact={isCompact}>
        {foodParcel.householdName}
    </div>
);

/**
 * Mock ReschedulePickupModal component
 */
export interface MockReschedulePickupModalProps {
    opened: boolean;
    onClose: () => void;
    foodParcel: FoodParcel | null;
    onRescheduled: () => void;
}

export const MockReschedulePickupModal = ({
    opened,
    onClose,
    foodParcel,
    onRescheduled,
}: MockReschedulePickupModalProps) => {
    if (!opened) return null;

    return (
        <div data-testid="reschedule-modal">
            <div data-testid="modal-title">Boka om matstöd</div>
            <div data-testid="modal-household-name">{foodParcel?.householdName}</div>
            <button
                data-testid="submit-button"
                onClick={() => {
                    // Simulate a successful reschedule
                    onRescheduled();
                    onClose();
                }}
            >
                Bekräfta ändring
            </button>
            <button data-testid="cancel-button" onClick={onClose}>
                Avbryt
            </button>
        </div>
    );
};

/**
 * Mock ScrollArea component
 */
export interface MockScrollAreaProps {
    children: ReactNode;
    [key: string]: any;
}

export const MockScrollArea = ({ children, ...props }: MockScrollAreaProps) => (
    <div data-testid="scroll-area" {...props}>
        {children}
    </div>
);

/**
 * Create mock useDroppable hook
 */
export interface UseDroppableParams {
    id: string;
    disabled: boolean;
}

// Create a shared instance of the DnD hooks to ensure consistent state
export let sharedMockDragEndHandler: ((event: any) => void) | null = null;

export const setSharedMockDragEndHandler = (handler: ((event: any) => void) | null) => {
    sharedMockDragEndHandler = handler;
};

export const getSharedMockDragEndHandler = () => {
    return sharedMockDragEndHandler;
};

let sharedMockIsOver = false;
let sharedMockSetNodeRef = () => {};
let sharedLastDroppableId = "";
let sharedLastDisabledValue = false;

// Create a singleton instance
let mockDndInstance: any = null;

export const createMockDndHooks = () => {
    if (mockDndInstance) {
        return mockDndInstance;
    }

    // Mock useDroppable hook with tracking
    const mockUseDroppable = ({ id, disabled }: UseDroppableParams) => {
        sharedLastDroppableId = id;
        sharedLastDisabledValue = disabled;
        return {
            setNodeRef: sharedMockSetNodeRef,
            isOver: sharedMockIsOver,
        };
    };

    mockDndInstance = {
        get mockIsOver() {
            return sharedMockIsOver;
        },
        get mockSetNodeRef() {
            return sharedMockSetNodeRef;
        },
        get lastDroppableId() {
            return sharedLastDroppableId;
        },
        get lastDisabledValue() {
            return sharedLastDisabledValue;
        },
        get mockDragEndHandler() {
            return sharedMockDragEndHandler;
        },
        mockUseDroppable,
        setMockIsOver: (value: boolean) => {
            sharedMockIsOver = value;
        },
        setMockDragEndHandler: setSharedMockDragEndHandler,
    };

    return mockDndInstance;
};
