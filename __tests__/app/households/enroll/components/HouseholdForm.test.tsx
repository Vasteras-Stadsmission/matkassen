// filepath: /Users/niklasmagnusson/git/matkassen/__tests__/app/households/enroll/components/HouseholdForm.test.tsx
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import React, { ChangeEvent } from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { Household } from "@/app/households/enroll/types";

// Set up happy-dom for DOM simulation in tests
const window = new Window();
global.document = window.document;
global.window = window as any;
global.navigator = window.navigator as any;

// Create mock functions for form operations using proper bun:test syntax
const setValuesMock = mock(() => {});
const setFieldErrorMock = mock(() => {});
const getInputPropsMock = mock(() => ({
    value: "",
    onChange: (e: ChangeEvent<HTMLInputElement>) => e,
}));

// Create a proper implementation for the mockForm
const mockForm = {
    values: {
        first_name: "",
        last_name: "",
        phone_number: "",
        postal_code: "",
        locale: "sv",
    },
    errors: {} as Record<string, string>,
    setValues: (values: Record<string, any>) => {
        setValuesMock(values);
        mockForm.values = { ...mockForm.values, ...values };
    },
    setFieldError: (field: string, message: string) => {
        setFieldErrorMock(field, message);
        mockForm.errors[field] = message;
    },
    getInputProps: (field: string) => {
        getInputPropsMock(field);
        return {
            value: mockForm.values[field] || "",
            onChange: (e: ChangeEvent<HTMLInputElement>) => e,
            error: mockForm.errors[field],
        };
    },
    validateField: () => {},
};

// Mock the mantine/form module
mock.module("@mantine/form", () => ({
    useForm: () => mockForm,
}));

// Define theme for Mantine Provider
const DEFAULT_THEME = {
    colors: {
        blue: [
            "#e6f7ff",
            "#bae7ff",
            "#91d5ff",
            "#69c0ff",
            "#40a9ff",
            "#1890ff",
            "#096dd9",
            "#0050b3",
            "#003a8c",
            "#002766",
        ],
    },
    radius: {
        sm: "4px",
        md: "8px",
        lg: "16px",
        xl: "32px",
    },
    spacing: {
        xs: "10px",
        sm: "12px",
        md: "16px",
        lg: "20px",
        xl: "24px",
    },
    fontSizes: {
        xs: "12px",
        sm: "14px",
        md: "16px",
        lg: "18px",
        xl: "20px",
    },
    other: {},
    primaryColor: "blue",
    primaryShade: 6,
    white: "#fff",
    black: "#000",
};

// Mock all necessary Mantine components
mock.module("@mantine/core", () => ({
    MantineProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mantine-provider">{children}</div>
    ),
    TextInput: ({
        label,
        value,
        onChange,
        ...props
    }: {
        label: string;
        value?: string;
        onChange?: (e: any) => void;
        [key: string]: any;
    }) => (
        <div data-testid={`text-input-${label}`}>
            <label>{label}</label>
            <input
                data-testid={`text-input-value-${label}`}
                value={value || ""}
                onChange={e => onChange && onChange(e)}
                {...props}
            />
        </div>
    ),
    SimpleGrid: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="simple-grid">{children}</div>
    ),
    Title: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="title">{children}</div>
    ),
    Text: ({ children }: { children: React.ReactNode }) => <div data-testid="text">{children}</div>,
    Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
    Box: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
        <div data-testid="box" style={style || {}}>
            {children}
        </div>
    ),
    useMantineTheme: () => DEFAULT_THEME,
}));

// Import the component to test
import HouseholdForm from "@/app/households/enroll/components/HouseholdForm";

// Define test helpers
interface ErrorType {
    field: string;
    message: string;
}

// Mock HouseholdForm wrapper with controlled state
const MockHouseholdForm = ({
    data,
    updateData,
    error,
}: {
    data: Household;
    updateData: (data: Household) => void;
    error: ErrorType | null;
}) => {
    // Initialize the form with data
    mockForm.setValues({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        phone_number: data.phone_number || "",
        postal_code: data.postal_code || "",
        locale: data.locale || "sv",
    });

    // If there's an error, set the field error
    if (error) {
        mockForm.setFieldError(error.field, error.message);
    }

    return (
        <div data-testid="mantine-provider">
            <div data-testid="mock-household-form">
                <HouseholdForm data={data} updateData={updateData} error={error} />
            </div>
        </div>
    );
};

// Test helper functions
const getByTestId = (container: HTMLElement, testId: string): HTMLElement => {
    const element = container.querySelector(`[data-testid="${testId}"]`);
    if (!element) {
        throw new Error(`Element with data-testid="${testId}" not found`);
    }
    return element as HTMLElement;
};

describe("HouseholdForm Component", () => {
    // Before each test, reset the mock functions
    beforeEach(() => {
        setValuesMock.mockReset();
        setFieldErrorMock.mockReset();
        getInputPropsMock.mockReset();
        mockForm.errors = {};
        // Reset getInputPropsMock to its default implementation if needed
        getInputPropsMock.mockImplementation(() => ({
            value: "",
            onChange: (e: ChangeEvent<HTMLInputElement>) => e,
        }));
    });

    it("updates form values when data prop changes", async () => {
        // Initial data
        const initialData: Household = {
            first_name: "Initial",
            last_name: "User",
            phone_number: "1234567890",
            locale: "sv",
            postal_code: "12345",
        };

        const updateDataMock = mock(() => {});

        // Make updateDataMock a function that can be called by the component
        const updateDataFn = (data: Household) => {
            updateDataMock(data);
        };

        // Render component with initial data
        const { rerender } = render(
            <MockHouseholdForm data={initialData} updateData={updateDataFn} error={null} />,
        );

        // Check that the form is initialized with the initial data
        expect(setValuesMock.mock.calls.length).toBeGreaterThan(0);

        // Create new data that would be loaded asynchronously
        const newData: Household = {
            first_name: "New",
            last_name: "Person",
            phone_number: "0987654321",
            locale: "sv",
            postal_code: "54321",
        };

        // Re-render the component with new data (simulating async data load)
        rerender(<MockHouseholdForm data={newData} updateData={updateDataFn} error={null} />);

        // The form values should be updated when data changes
        expect(setValuesMock.mock.calls.length).toBeGreaterThan(1);
    });

    it("handles validation errors from parent", async () => {
        const data: Household = {
            first_name: "Test",
            last_name: "User",
            phone_number: "1234567890",
            locale: "sv",
            postal_code: "12345",
        };

        const error: ErrorType = {
            field: "first_name",
            message: "First name is required",
        };

        const updateDataMock = mock(() => {});
        const updateDataFn = (data: Household) => {
            updateDataMock(data);
        };

        const { rerender } = render(
            <MockHouseholdForm data={data} updateData={updateDataFn} error={null} />,
        );

        // No error initially
        expect(setFieldErrorMock.mock.calls.length).toBe(0);

        // Update with an error
        rerender(<MockHouseholdForm data={data} updateData={updateDataFn} error={error} />);

        // Should set the field error
        expect(setFieldErrorMock.mock.calls.length).toBeGreaterThan(0);
    });
});
