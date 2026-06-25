"use client";

import type { ReactNode } from "react";
import type { AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";
import { fmtInt, toStockBuckets } from "./catalog-format";

export function CatalogKpis({ rows }: { rows: AdminCardCatalogRow[] }) {
  let available = 0;
  let packs = 0;
  let bags = 0;
  const counts = { card: 0, box: 0, pack: 0 };

  for (const row of rows) {
    const b = toStockBuckets(row);
    available += b.available;
    packs += b.packs;
    bags += b.bags;
    const cat = String(row.card.catalogCategory ?? "");
    if (cat === "Sealed Boxes") counts.box += 1;
    else if (cat === "Sealed Packs") counts.pack += 1;
    else counts.card += 1;
  }

  return (
    <div className="pcx-kpis">
      <Kpi
        label="Catalog items"
        value={fmtInt(rows.length)}
        sub={`${counts.card} cards · ${counts.box} boxes · ${counts.pack} packs`}
        accent="var(--a-gold)"
      />
      <Kpi
        label="Available stock"
        value={fmtInt(available)}
        sub="free to build new packs"
        accent="var(--pcx-available)"
        dot
      />
      <Kpi
        label="In packs"
        value={fmtInt(packs)}
        sub="loaded into gacha packs"
        accent="var(--pcx-packs)"
        dot
      />
      <Kpi
        label="In customer bags"
        value={fmtInt(bags)}
        sub="won, awaiting ship / convert"
        accent="var(--pcx-bags)"
        dot
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  dot,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  accent: string;
  dot?: boolean;
}) {
  return (
    <div
      className="pcx-kpi"
      style={{ ["--accent" as string]: accent }}
    >
      <div className="pcx-kpi-label">
        {dot && (
          <span className="pcx-dot" style={{ background: accent }} />
        )}
        {label}
      </div>
      <div className="pcx-kpi-val">{value}</div>
      <div className="pcx-kpi-sub">{sub}</div>
    </div>
  );
}
