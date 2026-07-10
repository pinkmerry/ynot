"use client";

import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";

/**
 * Small presentational form primitives for the sell form, ported 1:1 from the
 * design prototype's SellField / SellInput / SellSelect / SellSeg
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-3.jsx:23-54).
 * Kept in their own file so SellForm.tsx stays focused on data + submission.
 */

const sellInputStyle: React.CSSProperties = {
  border: "1px solid var(--mp-line-strong)",
  background: "var(--mp-paper)",
  borderRadius: 10,
  padding: "10px 13px",
  font: "inherit",
  fontSize: 13,
  color: "var(--mp-ink)",
  width: "100%",
  outline: "none",
};

export interface SellFieldProps {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}

export function SellField({ label, hint, wide, children }: SellFieldProps) {
  return (
    <label className="mp-stack" style={{ gap: 6, gridColumn: wide ? "1 / -1" : "auto" }}>
      <span className="mp-rail-label" style={{ color: "var(--mp-mute)" }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mp-small mp-mute" style={{ fontSize: 11 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function SellInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...sellInputStyle, ...(props.style ?? {}) }} />;
}

export interface SellSelectOption {
  value: string;
  label: string;
}

export interface SellSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SellSelectOption[];
  placeholder?: string;
  id?: string;
}

export function SellSelect({ value, onChange, options, placeholder, id }: SellSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      style={{ ...sellInputStyle, appearance: "none", cursor: "pointer" }}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface SellSegProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SellSelectOption[];
}

export function SellSeg({ value, onChange, options }: SellSegProps) {
  return (
    <div className="mp-row" style={{ gap: 7 }}>
      {options.map((option) => (
        <span
          key={option.value}
          className={"mp-chip" + (value === option.value ? " active" : "")}
          style={{ cursor: "pointer", flex: 1, justifyContent: "center" }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </span>
      ))}
    </div>
  );
}
