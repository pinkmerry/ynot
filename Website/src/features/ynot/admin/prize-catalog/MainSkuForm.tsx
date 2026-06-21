"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  createMainSku,
  updateMainSku,
  uploadCardImage,
  type MainSkuInput,
} from "./catalog-api";

const SERIES_OPTIONS = ["Pokemon", "One Piece", "Custom…"] as const;
const CATEGORY_OPTIONS = [
  "Single Cards",
  "Sealed Boxes",
  "Sealed Packs",
] as const;

type SeriesOption = (typeof SERIES_OPTIONS)[number];
type CatalogCategory = (typeof CATEGORY_OPTIONS)[number];

type MainSkuFormProps = {
  initial?: CardCatalogItem;
  onDone?: () => void;
};

function seriesDisplayToOption(series: string | undefined): SeriesOption {
  if (!series) return "Pokemon";
  const lower = series.toLowerCase();
  if (lower === "pokemon") return "Pokemon";
  if (lower === "one_piece" || lower === "one piece") return "One Piece";
  return "Custom…";
}

function categoryDisplay(cat: string | undefined): CatalogCategory {
  if (cat === "Sealed Boxes") return "Sealed Boxes";
  if (cat === "Sealed Packs") return "Sealed Packs";
  return "Single Cards";
}

export function MainSkuForm({ initial, onDone }: MainSkuFormProps) {
  const isEdit = Boolean(initial?.catalogCardId);

  const [code, setCode] = useState(initial?.code ?? initial?.modelCode ?? "");
  const [cardNumber, setCardNumber] = useState(initial?.cardNumber ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const initialSeriesOption = seriesDisplayToOption(initial?.series);
  const [seriesOption, setSeriesOption] =
    useState<SeriesOption>(initialSeriesOption);
  const [customSeries, setCustomSeries] = useState(
    initialSeriesOption === "Custom…" ? (initial?.series ?? "") : "",
  );
  const [cardSet, setCardSet] = useState(initial?.cardSet ?? "");
  const [releaseYear, setReleaseYear] = useState(
    initial?.releaseYear != null ? String(initial.releaseYear) : "",
  );
  const [category, setCategory] = useState<CatalogCategory>(
    categoryDisplay(initial?.catalogCategory),
  );
  const [image, setImage] = useState<{
    url: string;
    storagePath?: string;
  } | null>(
    initial?.photoUrl ? { url: initial.photoUrl, storagePath: initial.photoStoragePath ?? undefined } : null,
  );

  const [error, setError] = useState("");
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const resolvedSeries =
    seriesOption === "Custom…" ? customSeries : seriesOption;

  async function onPickImage(file: File) {
    setError("");
    const res = await uploadCardImage(file);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setImage(res.data);
  }

  function submit(confirmOverwrite = false) {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    start(async () => {
      const input: MainSkuInput = {
        cardId: initial?.catalogCardId,
        name: name.trim(),
        modelCode: code.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        series: resolvedSeries || undefined,
        cardSet: cardSet.trim() || undefined,
        releaseYear: releaseYear.trim() || undefined,
        catalogCategory: category,
        imageUrl: image?.url,
        imageStoragePath: image?.storagePath,
        confirmOverwrite,
      };
      const res = initial?.catalogCardId
        ? await updateMainSku({ ...input, cardId: initial.catalogCardId })
        : await createMainSku(input);
      if (!res.ok) {
        if (res.code === "CARD_ALREADY_EXISTS" && !confirmOverwrite) {
          setShowOverwrite(true);
          return;
        }
        setError(res.error);
        return;
      }
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="pcx-form">
      <div className="pcx-form-row2">
        <Field label="Code" htmlFor="pcx-code">
          <input
            id="pcx-code"
            className="pcx-input mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="EB01-001"
          />
        </Field>
        <Field label="Name" htmlFor="pcx-name">
          <input
            id="pcx-name"
            className="pcx-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Monkey D. Luffy"
            required
          />
        </Field>
      </div>

      <div className="pcx-form-row2">
        <Field label="Series" htmlFor="pcx-series">
          <select
            id="pcx-series"
            className="pcx-input"
            value={seriesOption}
            onChange={(e) => {
              const v = e.target.value as SeriesOption;
              setSeriesOption(v);
              if (v !== "Custom…") setCustomSeries("");
            }}
          >
            {SERIES_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {seriesOption === "Custom…" && (
            <input
              className="pcx-input pcx-mt4"
              value={customSeries}
              onChange={(e) => setCustomSeries(e.target.value)}
              placeholder="Custom brand name"
            />
          )}
        </Field>
        <Field label="Set" htmlFor="pcx-set">
          <input
            id="pcx-set"
            className="pcx-input"
            value={cardSet}
            onChange={(e) => setCardSet(e.target.value)}
            placeholder="Memorial Collection"
          />
        </Field>
      </div>

      <div className="pcx-form-row2">
        <Field label="Year" htmlFor="pcx-year">
          <input
            id="pcx-year"
            className="pcx-input"
            value={releaseYear}
            onChange={(e) => setReleaseYear(e.target.value)}
            placeholder="2026"
            inputMode="numeric"
          />
        </Field>
        <Field label="Card number" htmlFor="pcx-number">
          <input
            id="pcx-number"
            className="pcx-input mono"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="001/115"
          />
        </Field>
      </div>

      <Field label="Category" htmlFor="pcx-category">
        <select
          id="pcx-category"
          className="pcx-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as CatalogCategory)}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Card image" htmlFor="pcx-image" optional>
        <input
          ref={fileRef}
          id="pcx-image"
          type="file"
          accept="image/*"
          className="pcx-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickImage(file);
          }}
        />
        <div
          className="pcx-img-drop"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
        >
          {image?.url ? (
            <img src={image.url} alt="Card preview" className="pcx-img-preview" />
          ) : (
            <span className="pcx-img-ph">Click to upload</span>
          )}
        </div>
      </Field>

      {error && <div className="pcx-form-error" role="alert">{error}</div>}

      {showOverwrite && (
        <div className="pcx-form-overwrite" role="alert">
          <p>A card with this code already exists. Overwrite?</p>
          <button
            type="button"
            className="pcx-btn pcx-btn-warn"
            onClick={() => {
              setShowOverwrite(false);
              submit(true);
            }}
          >
            Confirm overwrite
          </button>
        </div>
      )}

      <div className="pcx-form-actions">
        <button
          type="button"
          className="pcx-btn pcx-btn-primary"
          disabled={pending}
          onClick={() => submit()}
        >
          {pending
            ? "Saving…"
            : isEdit
              ? "Update Main SKU"
              : "Create Main SKU"}
        </button>
        {onDone && (
          <button
            type="button"
            className="pcx-btn pcx-btn-ghost"
            onClick={onDone}
            disabled={pending}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="pcx-field">
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="pcx-opt"> optional</span>}
      </label>
      {children}
    </div>
  );
}
