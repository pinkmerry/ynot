"use client";

import { MpPanel } from "../shared/MpPrimitives";
import { SellField, SellInput, SellSeg, SellSelect } from "./SellFormFields";
import type { SellCatalogOptions, SellFieldValues } from "./sellFormTypes";

/**
 * "Card details" + "Condition & grade" panels, split out of SellForm.tsx to
 * keep that file focused on data/submission logic. Visuals port the design
 * prototype's identity grid and condition segment
 * (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-3.jsx:165-215).
 *
 * The prototype's cert autofill button is intentionally NOT ported here —
 * graded cards only ever render a plain cert-number text input with no
 * autofill affordance and no lookup call.
 */

const MAX_TITLE_LENGTH = 240;

export interface SellIdentityPanelProps {
  fields: SellFieldValues;
  options: SellCatalogOptions;
  isGraded: boolean;
  disabledIdentity: boolean;
  setField: <K extends keyof SellFieldValues>(key: K, value: SellFieldValues[K]) => void;
}

export function SellIdentityPanel({
  fields,
  options,
  isGraded,
  disabledIdentity,
  setField,
}: SellIdentityPanelProps) {
  return (
    <>
      <MpPanel>
        <div className="mp-row" style={{ gap: 9, marginBottom: 16 }}>
          <span className="mp-step now" style={{ fontSize: 13 }}>
            <span className="n">2</span>
          </span>
          <span className="mp-h3">Card details</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <SellField label="Card name" wide>
            <SellInput
              value={fields.name}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Charizard ex — Special Illustration Rare"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Series">
            <SellSelect
              value={fields.series}
              onChange={(value) => setField("series", value)}
              options={options.seriesOptions}
              placeholder="Select series…"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Category">
            <SellSelect
              value={fields.category}
              onChange={(value) => setField("category", value)}
              options={options.categoryOptions}
              placeholder="Select category…"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Set" hint="e.g. SV-151, OP-09">
            <SellInput
              value={fields.set}
              onChange={(event) => setField("set", event.target.value)}
              placeholder="SV-151"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Card number" hint="e.g. 199/165, OP09-118">
            <SellInput
              value={fields.code}
              onChange={(event) => setField("code", event.target.value)}
              placeholder="199/165"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Variant">
            <SellInput
              value={fields.variant}
              onChange={(event) => setField("variant", event.target.value)}
              placeholder="e.g. Alternate Art"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Print">
            <SellInput
              value={fields.print}
              onChange={(event) => setField("print", event.target.value)}
              placeholder="e.g. 1st Edition"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Language">
            <SellSelect
              value={fields.language}
              onChange={(value) => setField("language", value)}
              options={options.languageOptions}
              placeholder="Select language…"
              disabled={disabledIdentity}
            />
          </SellField>
          <SellField label="Release year">
            <SellSelect
              value={fields.year}
              onChange={(value) => setField("year", value)}
              options={options.releaseYearOptions.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              placeholder="Year…"
              disabled={disabledIdentity}
            />
          </SellField>
        </div>
      </MpPanel>

      <MpPanel>
        <div className="mp-row" style={{ gap: 9, marginBottom: 16 }}>
          <span className="mp-step now" style={{ fontSize: 13 }}>
            <span className="n">3</span>
          </span>
          <span className="mp-h3">Condition &amp; grade</span>
        </div>
        <div className="mp-stack" style={{ gap: 14 }}>
          <SellField label="Condition">
            <SellSeg
              value={fields.condition}
              onChange={(value) => setField("condition", value as SellFieldValues["condition"])}
              options={options.conditionOptions}
              disabled={disabledIdentity}
            />
          </SellField>
          {isGraded ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <SellField label="Grading service">
                <SellSelect
                  value={fields.grader}
                  onChange={(value) => setField("grader", value)}
                  options={options.gradingServiceOptions}
                  disabled={disabledIdentity}
                />
              </SellField>
              <SellField label="Grade">
                <SellSelect
                  value={fields.grade}
                  onChange={(value) => setField("grade", value)}
                  options={options.gradeOptions.map((grade) => ({ value: grade, label: grade }))}
                  placeholder="Select grade…"
                  disabled={disabledIdentity}
                />
              </SellField>
              <SellField label="Cert number" wide hint="Printed on the grading company's label">
                <SellInput
                  value={fields.cert}
                  onChange={(event) => setField("cert", event.target.value)}
                  placeholder="82114307"
                  maxLength={120}
                  disabled={disabledIdentity}
                />
              </SellField>
            </div>
          ) : null}
          {fields.condition === "raw" ? (
            <span className="mp-small mp-mute">
              Raw cards are graded by our team on arrival and listed as verified Raw · condition
              noted from your photos.
            </span>
          ) : null}
          {fields.condition === "sealed" ? (
            <span className="mp-small mp-mute">
              Sealed product is weighed and checked for factory shrink before it lists.
            </span>
          ) : null}
        </div>
      </MpPanel>
    </>
  );
}
