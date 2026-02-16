import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => "sv",
}));

vi.mock("@/app/i18n/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

vi.mock("mantine-datatable", () => ({
    DataTable: ({ records, sortStatus, onSortStatusChange }: any) => (
        <div data-testid="data-table">
            <div data-testid="record-count">{records?.length || 0}</div>
            <div data-testid="first-record-last-name">{records?.[0]?.last_name || ""}</div>
            <button
                data-testid="sort-by-last-name-desc"
                onClick={() =>
                    onSortStatusChange({
                        columnAccessor: "last_name",
                        direction: "desc",
                    })
                }
            />
            <button
                data-testid="sort-by-first-name-asc"
                onClick={() =>
                    onSortStatusChange({
                        columnAccessor: "first_name",
                        direction: "asc",
                    })
                }
            />
        </div>
    ),
}));

vi.mock("@mantine/core", () => {
    const SelectMock = ({ placeholder, data, value, onChange, clearable }: any) => (
        <div>
            <select
                data-testid={`select-${placeholder}`}
                value={value || ""}
                onChange={e => onChange(e.target.value || null)}
            >
                <option value="">{placeholder}</option>
                {(data || []).map((item: any) => (
                    <option key={item.value} value={item.value}>
                        {item.label}
                    </option>
                ))}
            </select>
            {clearable && value && (
                <button data-testid={`clear-${placeholder}`} onClick={() => onChange(null)} />
            )}
        </div>
    );

    return {
        MantineProvider: ({ children }: any) => <>{children}</>,
        TextInput: ({ placeholder, value, onChange, rightSection }: any) => (
            <div>
                <input
                    data-testid="search-input"
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                />
                {rightSection}
            </div>
        ),
        Select: SelectMock,
        ActionIcon: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
        Tooltip: ({ children }: any) => <>{children}</>,
        Group: ({ children }: any) => <div>{children}</div>,
        Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
        Menu: Object.assign(({ children }: any) => <div>{children}</div>, {
            Target: ({ children }: any) => <div>{children}</div>,
            Dropdown: ({ children }: any) => <div>{children}</div>,
            Label: ({ children }: any) => <div>{children}</div>,
        }),
        Checkbox: ({ label, checked, onChange }: any) => (
            <label>
                <input type="checkbox" checked={checked} onChange={onChange} />
                {label}
            </label>
        ),
        Stack: ({ children }: any) => <div>{children}</div>,
    };
});

import HouseholdsTable, { Household } from "@/app/[locale]/households/components/HouseholdsTable";

const makeHousehold = (overrides: Partial<Household> & { id: string }): Household => ({
    first_name: "First",
    last_name: "Last",
    phone_number: "0701234567",
    locale: "sv",
    created_by: null,
    primaryPickupLocationName: null,
    firstParcelDate: null,
    lastParcelDate: null,
    nextParcelDate: null,
    nextParcelEarliestTime: null,
    ...overrides,
});

const testHouseholds: Household[] = [
    makeHousehold({
        id: "1",
        first_name: "Anna",
        last_name: "Andersson",
        created_by: "admin",
        primaryPickupLocationName: "Centrum",
    }),
    makeHousehold({
        id: "2",
        first_name: "Björn",
        last_name: "Berg",
        created_by: "admin",
        primaryPickupLocationName: "Erikslund",
    }),
    makeHousehold({
        id: "3",
        first_name: "Cecilia",
        last_name: "Carlsson",
        created_by: "volunteer1",
        primaryPickupLocationName: "Centrum",
    }),
    makeHousehold({
        id: "4",
        first_name: "David",
        last_name: "Dahl",
        created_by: "volunteer1",
        primaryPickupLocationName: "Erikslund",
    }),
    makeHousehold({
        id: "5",
        first_name: "Erik",
        last_name: "Ek",
        created_by: "volunteer2",
        primaryPickupLocationName: null,
    }),
];

const recordCount = () => Number(screen.getByTestId("record-count").textContent);
const firstRecordLastName = () => screen.getByTestId("first-record-last-name").textContent;

const selectLocation = (value: string) => {
    fireEvent.change(screen.getByTestId("select-filters.location"), {
        target: { value },
    });
};

const selectCreator = (value: string) => {
    fireEvent.change(screen.getByTestId("select-filters.createdBy"), {
        target: { value },
    });
};

const clearLocation = () => {
    fireEvent.click(screen.getByTestId("clear-filters.location"));
};

const clearCreator = () => {
    fireEvent.click(screen.getByTestId("clear-filters.createdBy"));
};

const typeSearch = (value: string) => {
    fireEvent.change(screen.getByTestId("search-input"), {
        target: { value },
    });
};

describe("HouseholdsTable - Filter and Sort", () => {
    beforeEach(() => {
        Object.defineProperty(window, "localStorage", {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn(),
                key: vi.fn(),
                length: 0,
            },
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("Location filter", () => {
        it("shows only households at the selected location", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            expect(recordCount()).toBe(5);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);

            selectLocation("Erikslund");
            expect(recordCount()).toBe(2);
        });

        it("excludes households with no location set", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);
        });
    });

    describe("Creator filter", () => {
        it("shows only households created by the selected user", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectCreator("admin");
            expect(recordCount()).toBe(2);

            selectCreator("volunteer1");
            expect(recordCount()).toBe(2);

            selectCreator("volunteer2");
            expect(recordCount()).toBe(1);
        });
    });

    describe("Combined filters", () => {
        it("applies location and creator filters together", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            selectCreator("admin");
            expect(recordCount()).toBe(1);
        });

        it("returns zero when no households match both filters", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            selectCreator("volunteer2");
            expect(recordCount()).toBe(0);
        });
    });

    describe("Filters with text search", () => {
        it("applies text search on top of location filter", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);

            typeSearch("Anna");
            expect(recordCount()).toBe(1);
        });

        it("applies text search on top of creator filter", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectCreator("admin");
            expect(recordCount()).toBe(2);

            typeSearch("Berg");
            expect(recordCount()).toBe(1);
        });

        it("applies text search on top of both filters", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Erikslund");
            selectCreator("volunteer1");
            expect(recordCount()).toBe(1);

            typeSearch("Dahl");
            expect(recordCount()).toBe(1);

            typeSearch("nonexistent");
            expect(recordCount()).toBe(0);
        });
    });

    describe("Sorting preserves active filters", () => {
        it("keeps location filter applied after changing sort", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);

            fireEvent.click(screen.getByTestId("sort-by-last-name-desc"));
            expect(recordCount()).toBe(2);
            expect(firstRecordLastName()).toBe("Carlsson");
        });

        it("keeps creator filter applied after changing sort", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectCreator("admin");
            expect(recordCount()).toBe(2);

            fireEvent.click(screen.getByTestId("sort-by-first-name-asc"));
            expect(recordCount()).toBe(2);
            expect(firstRecordLastName()).toBe("Andersson");
        });

        it("keeps combined filters and search applied after changing sort", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Erikslund");
            selectCreator("volunteer1");
            typeSearch("David");
            expect(recordCount()).toBe(1);

            fireEvent.click(screen.getByTestId("sort-by-last-name-desc"));
            expect(recordCount()).toBe(1);
        });
    });

    describe("Clearing filters", () => {
        it("shows all records after clearing location filter", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);

            clearLocation();
            expect(recordCount()).toBe(5);
        });

        it("shows all records after clearing creator filter", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectCreator("admin");
            expect(recordCount()).toBe(2);

            clearCreator();
            expect(recordCount()).toBe(5);
        });

        it("restores correct count after clearing one of two filters", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            selectCreator("admin");
            expect(recordCount()).toBe(1);

            clearCreator();
            expect(recordCount()).toBe(2);

            selectCreator("admin");
            clearLocation();
            expect(recordCount()).toBe(2);
        });

        it("shows all records after clearing location filter via empty select", () => {
            render(<HouseholdsTable households={testHouseholds} />);

            selectLocation("Centrum");
            expect(recordCount()).toBe(2);

            selectLocation("");
            expect(recordCount()).toBe(5);
        });
    });
});
