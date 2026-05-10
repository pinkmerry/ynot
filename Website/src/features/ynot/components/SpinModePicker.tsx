"use client";

import { useState } from "react";
import type { SpinMode, SpinConfigInventoryBand } from "../types";

const MODE_OPTIONS: Array<{
  value: SpinMode;
  label: string;
  description: string;
}> = [
  {
    value: "pure_random",
    label: "Pure Random",
    description: "สุ่มเท่ากันทุกใบที่มีในกล่อง",
  },
  {
    value: "weighted",
    label: "Weighted",
    description: "ถ่วงน้ำหนัก: ตั้ง weight ต่อรางวัล (มากกว่า = ออกง่ายกว่า)",
  },
  {
    value: "inventory_gate",
    label: "Inventory + Unlock Gate",
    description: "รางวัลใหญ่ปลดล็อคเมื่อขายไปแล้ว X% (กันออกไวเกินไป)",
  },
];

export type SpinModePickerProps = {
  value: SpinMode;
  bands?: SpinConfigInventoryBand[];
  disabled?: boolean;
  onChange: (mode: SpinMode, bands: SpinConfigInventoryBand[]) => void;
};

const DEFAULT_BANDS: SpinConfigInventoryBand[] = [
  { rankStart: 1, rankEnd: 3, unlockAtSoldPct: 30 },
  { rankStart: 4, rankEnd: 6, unlockAtSoldPct: 10 },
  { rankStart: 7, rankEnd: 999, unlockAtSoldPct: 0 },
];

export function SpinModePicker({
  value,
  bands: bandsProp,
  disabled = false,
  onChange,
}: SpinModePickerProps) {
  const [bands, setBands] = useState<SpinConfigInventoryBand[]>(
    bandsProp && bandsProp.length > 0 ? bandsProp : DEFAULT_BANDS,
  );

  const handleModeChange = (next: SpinMode) => {
    onChange(next, next === "inventory_gate" ? bands : []);
  };

  const updateBand = (index: number, patch: Partial<SpinConfigInventoryBand>) => {
    const next = bands.map((band, i) => (i === index ? { ...band, ...patch } : band));
    setBands(next);
    onChange(value, next);
  };

  const addBand = () => {
    const last = bands[bands.length - 1];
    const next: SpinConfigInventoryBand[] = [
      ...bands,
      {
        rankStart: (last?.rankEnd ?? 0) + 1,
        rankEnd: (last?.rankEnd ?? 0) + 3,
        unlockAtSoldPct: 0,
      },
    ];
    setBands(next);
    onChange(value, next);
  };

  const removeBand = (index: number) => {
    const next = bands.filter((_, i) => i !== index);
    setBands(next);
    onChange(value, next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-sm font-semibold text-zinc-100">ระบบสุ่ม (Spin Mode)</div>
      <div className="space-y-2">
        {MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
              value === option.value
                ? "border-amber-400 bg-amber-400/10"
                : "border-zinc-800 hover:border-zinc-700"
            } ${disabled ? "opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="spin_mode"
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => handleModeChange(option.value)}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-zinc-100">{option.label}</div>
              <div className="text-xs text-zinc-400">{option.description}</div>
            </div>
          </label>
        ))}
      </div>

      {value === "inventory_gate" ? (
        <div className="space-y-2 rounded-md border border-zinc-800 bg-black/30 p-3">
          <div className="text-xs font-semibold text-zinc-200">
            Rank Bands (รางวัลในช่วง rank ใด ปลดล็อคเมื่อขายไปแล้วกี่ %)
          </div>
          <table className="w-full text-xs">
            <thead className="text-zinc-400">
              <tr>
                <th className="text-left">Rank ตั้งแต่</th>
                <th className="text-left">ถึง</th>
                <th className="text-left">ปลดที่ขายแล้ว (%)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bands.map((band, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={band.rankStart}
                      disabled={disabled}
                      onChange={(e) =>
                        updateBand(index, { rankStart: Number(e.target.value) || 1 })
                      }
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={band.rankEnd}
                      disabled={disabled}
                      onChange={(e) =>
                        updateBand(index, { rankEnd: Number(e.target.value) || 1 })
                      }
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={band.unlockAtSoldPct}
                      disabled={disabled}
                      onChange={(e) =>
                        updateBand(index, {
                          unlockAtSoldPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                    />
                  </td>
                  <td>
                    {!disabled && bands.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeBand(index)}
                        className="text-zinc-500 hover:text-red-400"
                        aria-label="remove band"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled ? (
            <button
              type="button"
              onClick={addBand}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              + เพิ่ม band
            </button>
          ) : null}
          <div className="text-[11px] text-zinc-500">
            ยังต้องตั้ง weight ต่อใบในตารางรางวัลด้วย (มี default = 1)
          </div>
        </div>
      ) : null}
    </div>
  );
}
