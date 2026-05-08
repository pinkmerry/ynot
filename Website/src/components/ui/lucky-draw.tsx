"use client";

import type React from "react";
import { useId } from "react";
import { Boxes } from "lucide-react";

export function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-bold text-white/85">
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-[var(--gold)]">{icon}</span>
      {text}
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-card rounded-3xl p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={strong ? "font-black text-[var(--gold)]" : "font-bold"}>{value}</dd>
    </div>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <textarea
        id={id}
        className="min-h-24 w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <select
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        min={1}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-3xl border border-dashed border-white/14 bg-white/[0.03] text-center text-sm text-[var(--muted)]">
      <div>
        <Boxes className="mx-auto mb-2 h-6 w-6 text-white/35" />
        {text}
      </div>
    </div>
  );
}
