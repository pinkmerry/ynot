"use client";

import type { ReactNode } from "react";
import type { AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";
import { fmtInt, toStockBuckets, unitNoun } from "./catalog-format";

export function LedgerRow({
  row,
  open,
  onToggle,
  isOwner,
}: {
  row: AdminCardCatalogRow;
  open: boolean;
  onToggle: () => void;
  isOwner: boolean;
}) {
  const b = toStockBuckets(row);
  const cat = String(row.card.catalogCategory ?? "Single Cards");
  const catClass =
    cat === "Sealed Boxes" ? " is-box" : cat === "Sealed Packs" ? " is-pack" : "";

  const seg = (k: "available" | "packs" | "bags" | "removed") =>
    b.total > 0 ? `${(b[k] / b.total) * 100}%` : "0%";

  return (
    <div
      className={`pcx-lrow${catClass}${open ? " open" : ""}`}
      data-id={row.card.catalogCardId}
    >
      <div
        className="pcx-lhead"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
      >
        <Thumb
          name={row.card.name}
          code={row.card.code ?? ""}
          image={row.card.photoUrl ?? null}
          category={cat}
        />
        <div className="pcx-lid">
          <div className="pcx-name">
            {row.card.name}{" "}
            <span className={`pcx-cat-chip ${chipClass(cat)}`}>{cat}</span>
          </div>
          <div className="pcx-meta">
            <span className="pcx-code">{row.card.code ?? ""}</span>
            <span>&middot;</span>
            <span>
              {row.card.series ?? ""} &middot;{" "}
              {row.card.releaseYear ?? "—"} &middot;{" "}
              {row.card.cardSet ?? "—"}
            </span>
          </div>
          <div className="pcx-rollup">
            <span className="pcx-sbar">
              <i
                style={{
                  width: seg("available"),
                  background: "var(--pcx-available)",
                }}
              />
              <i
                style={{
                  width: seg("packs"),
                  background: "var(--pcx-packs)",
                }}
              />
              <i
                style={{
                  width: seg("bags"),
                  background: "var(--pcx-bags)",
                }}
              />
              <i
                style={{
                  width: seg("removed"),
                  background: "var(--pcx-removed)",
                }}
              />
            </span>
            <span className="pcx-rollup-nums">
              <Num
                color="var(--pcx-available)"
                v={b.available}
                label="available"
              />
              <Num
                color="var(--pcx-packs)"
                v={b.packs}
                label="in packs"
              />
              <Num
                color="var(--pcx-bags)"
                v={b.bags}
                label="in bags"
              />
              {b.removed > 0 && (
                <Num
                  color="var(--pcx-removed)"
                  v={b.removed}
                  label="removed"
                />
              )}
            </span>
          </div>
        </div>
        <div className="pcx-lhead-right">
          <div className="pcx-total">
            <div className="pcx-total-v">{fmtInt(b.available)}</div>
            <div className="pcx-total-l">{unitNoun(cat)} free</div>
          </div>
          <span className="pcx-caret" aria-hidden>
            &#x203A;
          </span>
        </div>
      </div>
      {/* Expanded body: VariantTable + campaigns section land in Phase 2/3 */}
    </div>
  );
}

function Num({
  color,
  v,
  label,
}: {
  color: string;
  v: number;
  label: string;
}) {
  return (
    <span className="pcx-rn">
      <span className="pcx-dot" style={{ background: color }} />
      <b style={{ color }}>{fmtInt(v)}</b>
      <span>{label}</span>
    </span>
  );
}

function Thumb({
  name,
  code,
  image,
  category,
}: {
  name: string;
  code: string;
  image: string | null;
  category: string;
}): ReactNode {
  const sealClass = category !== "Single Cards" ? " seal" : "";
  if (image) {
    return (
      <span className={`pcx-thumb${sealClass}`}>
        <img src={image} alt={name} />
      </span>
    );
  }
  return (
    <span className={`pcx-thumb${sealClass}`}>
      <span className="pcx-ph-code">{code}</span>
    </span>
  );
}

function chipClass(cat: string) {
  return cat === "Sealed Boxes"
    ? "box"
    : cat === "Sealed Packs"
      ? "pack"
      : "card";
}
