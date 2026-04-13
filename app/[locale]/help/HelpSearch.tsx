"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paper, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import MiniSearch, { type SearchResult } from "minisearch";
import { useRouter } from "@/app/i18n/navigation";

export interface HelpSearchSection {
    id: string;
    manualSlug: string;
    anchor: string;
    sectionTitle: string;
    manualTitle: string;
    body: string;
}

interface HelpSearchProps {
    sections: HelpSearchSection[];
    placeholder: string;
    noResultsLabel: string;
}

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;
const SNIPPET_CONTEXT = 80;

/**
 * Client-side full-text search over the user's role-allowed manual
 * sections. Sections are indexed once per mount with MiniSearch;
 * the index is small enough (~40 sections, ~15 KB tokens) that
 * building it eagerly is cheaper than deferring it.
 *
 * Section-level granularity: each result deep-links into
 * /help/{manualSlug}#{anchor}, which scrolls directly to the H2
 * the user was looking for rather than the top of a manual.
 */
export function HelpSearch({ sections, placeholder, noResultsLabel }: HelpSearchProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const index = useMemo(() => {
        const mini = new MiniSearch<HelpSearchSection>({
            fields: ["sectionTitle", "manualTitle", "body"],
            storeFields: ["manualSlug", "anchor", "sectionTitle", "manualTitle", "body"],
            // Prefix + fuzzy gives us Swedish-friendly matching without a
            // stemmer: prefix catches plural/definite suffixes
            // (utlämning → utlämningar/utlämningen) and fuzzy 0.15 absorbs
            // minor typos in 5+ char tokens. If recall feels poor in
            // production, swap in a Swedish Snowball stemmer — the search
            // shape stays the same.
            searchOptions: {
                prefix: true,
                fuzzy: 0.15,
                boost: { sectionTitle: 3, manualTitle: 1.5 },
                combineWith: "AND",
            },
        });
        mini.addAll(sections);
        return mini;
    }, [sections]);

    const results = useMemo<SearchResult[]>(() => {
        const q = query.trim();
        if (q.length < MIN_QUERY_LENGTH) return [];
        return index.search(q).slice(0, MAX_RESULTS);
    }, [query, index]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [query]);

    // Close dropdown when clicking outside the search container.
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const handleSelect = (result: SearchResult) => {
        setQuery("");
        setIsOpen(false);
        router.push(`/help/${result.manualSlug}#${result.anchor}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || results.length === 0) {
            if (e.key === "Escape") setQuery("");
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const chosen = results[highlightedIndex];
            if (chosen) handleSelect(chosen);
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    const showDropdown = isOpen && query.trim().length >= MIN_QUERY_LENGTH;

    return (
        <div ref={wrapperRef} style={{ position: "relative" }}>
            <TextInput
                placeholder={placeholder}
                value={query}
                onChange={e => {
                    setQuery(e.currentTarget.value);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                leftSection={<IconSearch size={16} />}
                size="md"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
                role="combobox"
            />
            {showDropdown && (
                <Paper
                    withBorder
                    shadow="md"
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        zIndex: 10,
                        maxHeight: 420,
                        overflowY: "auto",
                    }}
                    role="listbox"
                >
                    {results.length === 0 ? (
                        <Text p="md" c="dimmed" size="sm">
                            {noResultsLabel}
                        </Text>
                    ) : (
                        <Stack gap={0}>
                            {results.map((result, idx) => (
                                <UnstyledButton
                                    key={result.id as string}
                                    onClick={() => handleSelect(result)}
                                    onMouseEnter={() => setHighlightedIndex(idx)}
                                    p="sm"
                                    role="option"
                                    aria-selected={idx === highlightedIndex}
                                    style={{
                                        backgroundColor:
                                            idx === highlightedIndex
                                                ? "var(--mantine-color-blue-0)"
                                                : undefined,
                                        borderBottom:
                                            idx < results.length - 1
                                                ? "1px solid var(--mantine-color-gray-2)"
                                                : undefined,
                                    }}
                                >
                                    <Text fw={600} size="sm">
                                        {result.sectionTitle as string}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {result.manualTitle as string}
                                    </Text>
                                    <Text size="xs" mt={2} c="dark.6">
                                        {buildSnippet(result.body as string, result.terms)}
                                    </Text>
                                </UnstyledButton>
                            ))}
                        </Stack>
                    )}
                </Paper>
            )}
        </div>
    );
}

/**
 * Pick a ~160-char window of the section body centred on the first
 * term match so the user sees their query in context. Falls back to
 * the start of the body if no match is found (shouldn't happen — if
 * MiniSearch returned this result, a term matched somewhere — but a
 * defensive slice keeps the UI sane either way).
 */
function buildSnippet(body: string, terms: string[]): string {
    if (!body) return "";
    const lower = body.toLowerCase();
    let hit = -1;
    for (const term of terms) {
        const found = lower.indexOf(term.toLowerCase());
        if (found !== -1 && (hit === -1 || found < hit)) hit = found;
    }
    if (hit === -1) {
        return body.length > SNIPPET_CONTEXT * 2 ? `${body.slice(0, SNIPPET_CONTEXT * 2)}…` : body;
    }
    const start = Math.max(0, hit - SNIPPET_CONTEXT);
    const end = Math.min(body.length, hit + SNIPPET_CONTEXT);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < body.length ? "…" : "";
    return `${prefix}${body.slice(start, end)}${suffix}`;
}
