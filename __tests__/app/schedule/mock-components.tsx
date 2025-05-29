import React, { ReactNode } from "react";
import { FoodParcel } from "@/app/[locale]/schedule/actions";

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

export const createMockDndHooks = () => {
    let mockIsOver = false;
    let mockSetNodeRef = () => {};
    let lastDroppableId = "";
    let lastDisabledValue = false;
    let mockDragEndHandler: ((event: any) => void) | null = null;

    // Mock useDroppable hook with tracking
    const mockUseDroppable = ({ id, disabled }: UseDroppableParams) => {
        lastDroppableId = id;
        lastDisabledValue = disabled;
        return {
            setNodeRef: mockSetNodeRef,
            isOver: mockIsOver,
        };
    };

    return {
        mockIsOver,
        mockSetNodeRef,
        lastDroppableId,
        lastDisabledValue,
        mockDragEndHandler,
        mockUseDroppable,
        setMockIsOver: (value: boolean) => {
            mockIsOver = value;
        },
        setMockDragEndHandler: (handler: any) => {
            mockDragEndHandler = handler;
        },
    };
};
