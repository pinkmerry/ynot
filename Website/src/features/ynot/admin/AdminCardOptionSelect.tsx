"use client";

import { useEffect, useRef, useState } from "react";

export type CardOptionKind =
  | "set"
  | "variant"
  | "language"
  | "release_year"
  | "brand";

type CardOption = { id: string; name: string };

/**
 * Searchable, creatable, editable dropdown for managed catalog options
 * (Set / Variant). The selected option's NAME is what flows through onChange —
 * cards still store the name as text; this list only powers the picker plus
 * inline create / rename / delete against /api/ynot/admin/card-options.
 */
export function AdminCardOptionSelect({
  kind,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
}: {
  kind: CardOptionKind;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CardOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function loadOptions() {
    try {
      const res = await fetch(`/api/ynot/admin/card-options?kind=${kind}`);
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.options)) setOptions(data.options);
    } finally {
      setLoaded(true);
    }
  }

  function toggleOpen() {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (next && !loaded) void loadOptions();
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setEditingId(null);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const filtered = options
    .filter((option) => option.name.toLowerCase().includes(lowerQuery))
    .filter((option) => option.name !== value);
  const exactExists = options.some(
    (option) => option.name.toLowerCase() === lowerQuery,
  );

  function sortOptions(list: CardOption[]) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  function selectOption(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
    setEditingId(null);
  }

  async function createOption(name: string) {
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ynot/admin/card-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.option) {
        setOptions((prev) =>
          prev.some((option) => option.id === data.option.id)
            ? prev
            : sortOptions([...prev, data.option]),
        );
        selectOption(data.option.name);
      }
    } finally {
      setBusy(false);
    }
  }

  async function renameOption(id: string, name: string) {
    if (!name || busy) return;
    const previous = options.find((option) => option.id === id);
    setBusy(true);
    try {
      const res = await fetch("/api/ynot/admin/card-options", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.option) {
        setOptions((prev) =>
          sortOptions(prev.map((option) => (option.id === id ? data.option : option))),
        );
        if (previous && value === previous.name) onChange(data.option.name);
      }
    } finally {
      setBusy(false);
      setEditingId(null);
    }
  }

  async function deleteOption(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/ynot/admin/card-options?id=${id}`, { method: "DELETE" });
      setOptions((prev) => prev.filter((option) => option.id !== id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-option-select" ref={rootRef}>
      <button
        type="button"
        className="admin-option-select-trigger"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? undefined : "admin-option-select-placeholder"}>
          {value || placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="admin-option-select-popover" role="listbox">
          <div className="admin-option-select-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M11 11l3 3" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or create…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && trimmedQuery && !exactExists) {
                  event.preventDefault();
                  void createOption(trimmedQuery);
                }
              }}
            />
          </div>

          <div className="admin-option-select-list">
            {value && (
              <>
                <p className="admin-option-select-group">Selected</p>
                <div className="admin-option-select-row">
                  <button
                    type="button"
                    className="admin-option-select-option"
                    onClick={() => selectOption(value)}
                  >
                    <span className="admin-option-select-check" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3.5 3.5 6.5-7" />
                      </svg>
                    </span>
                    {value}
                  </button>
                </div>
              </>
            )}
            {filtered.length > 0 && (
              <p className="admin-option-select-group">Existing</p>
            )}
            {filtered.map((option) =>
              editingId === option.id ? (
                <div className="admin-option-select-row is-editing" key={option.id}>
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void renameOption(option.id, editingName.trim());
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="admin-option-select-icon is-confirm"
                    aria-label="Save"
                    onClick={() => void renameOption(option.id, editingName.trim())}
                    disabled={busy}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 8.5l3.5 3.5 6.5-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="admin-option-select-icon"
                    aria-label="Cancel"
                    onClick={() => setEditingId(null)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="admin-option-select-row" key={option.id}>
                  <button
                    type="button"
                    className="admin-option-select-option"
                    onClick={() => selectOption(option.name)}
                  >
                    <span className="admin-option-select-check" aria-hidden="true">
                      {value === option.name && (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 8.5l3.5 3.5 6.5-7" />
                        </svg>
                      )}
                    </span>
                    {option.name}
                  </button>
                  <button
                    type="button"
                    className="admin-option-select-icon"
                    aria-label={`Edit ${option.name}`}
                    onClick={() => {
                      setEditingId(option.id);
                      setEditingName(option.name);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="admin-option-select-icon is-danger"
                    aria-label={`Delete ${option.name}`}
                    onClick={() => void deleteOption(option.id)}
                    disabled={busy}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
                    </svg>
                  </button>
                </div>
              ),
            )}

            {trimmedQuery && !exactExists && (
              <button
                type="button"
                className="admin-option-select-create"
                onClick={() => void createOption(trimmedQuery)}
                disabled={busy}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Create “{trimmedQuery}”
              </button>
            )}

            {loaded && !options.length && !trimmedQuery && (
              <p className="admin-option-select-empty">No options yet — type to create one.</p>
            )}
            {!loaded && (
              <p className="admin-option-select-empty">Loading…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
