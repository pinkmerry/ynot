"use client";

import { useEffect, useRef, useState } from "react";

export type AdminSearchableOption = { value: string; label: string };

const OPTION_STYLE: React.CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: 8,
  display: "flex",
  gap: 8,
  justifyContent: "flex-start",
  textAlign: "left",
  width: "100%",
};

/**
 * Static searchable dropdown — same look as AdminCardOptionSelect (search box,
 * Selected/Existing groups) but read-only: pick from a fixed list, no
 * create / rename / delete. Use for choosing an existing record (e.g. a
 * product card) rather than managing a free option list.
 */
export function AdminSearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
}: {
  options: AdminSearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? null;
  const lowerQuery = query.trim().toLowerCase();
  const filtered = options.filter(
    (option) =>
      option.value !== value && option.label.toLowerCase().includes(lowerQuery),
  );

  function select(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="admin-option-select" ref={rootRef}>
      <button
        type="button"
        className="admin-option-select-trigger"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? undefined : "admin-option-select-placeholder"}>
          {selected ? selected.label : placeholder}
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
              placeholder={searchPlaceholder}
            />
          </div>

          <div className="admin-option-select-list">
            {selected && (
              <>
                <p className="admin-option-select-group">Selected</p>
                <div className="admin-option-select-row">
                  <button
                    type="button"
                    className="admin-option-select-option"
                    style={OPTION_STYLE}
                    onClick={() => select(selected.value)}
                  >
                    <span className="admin-option-select-check" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3.5 3.5 6.5-7" />
                      </svg>
                    </span>
                    {selected.label}
                  </button>
                </div>
              </>
            )}
            {filtered.length > 0 && (
              <p className="admin-option-select-group">Existing</p>
            )}
            {filtered.map((option) => (
              <div className="admin-option-select-row" key={option.value}>
                <button
                  type="button"
                  className="admin-option-select-option"
                  style={OPTION_STYLE}
                  onClick={() => select(option.value)}
                >
                  <span className="admin-option-select-check" aria-hidden="true" />
                  {option.label}
                </button>
              </div>
            ))}
            {!filtered.length && !selected && (
              <p className="admin-option-select-empty">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
