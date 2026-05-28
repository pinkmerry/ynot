"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  YnotAddress,
  YnotShippingRequest,
  YnotViewer,
} from "../types";
import { FlashBanner } from "./FlashBanner";
import { Ico } from "./Icons";
import { Modal, PageHead, useToast } from "./UiKit";

type SectionKey = "profile" | "connections" | "addresses" | "shipping";

type ProfileDraft = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
  deliveryNote: string;
};

const emptyProfile: ProfileDraft = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: "Thailand",
  deliveryNote: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type ConnectionStatus = {
  connected: boolean;
  label?: string;
};

export type PersonalInfoExperienceProps = {
  viewer: YnotViewer;
  addresses: YnotAddress[];
  shipping: YnotShippingRequest[];
  connections: {
    line: ConnectionStatus;
    google: ConnectionStatus;
    email: ConnectionStatus;
  };
  links: {
    lineHref: string;
    googleConnectHref?: string;
    emailConnectHref?: string;
  };
};

export function PersonalInfoExperience({
  viewer,
  addresses,
  shipping,
  connections,
  links,
}: PersonalInfoExperienceProps) {
  const [section, setSection] = useState<SectionKey>("profile");
  const [addressRows, setAddressRows] = useState(addresses);

  function syncAddress(address: YnotAddress) {
    setAddressRows((current) => {
      const withoutCurrent = current
        .filter((row) => row.id !== address.id)
        .map((row) => (address.isDefault ? { ...row, isDefault: false } : row));
      return address.isDefault
        ? [address, ...withoutCurrent]
        : [...withoutCurrent, address];
    });
  }

  return (
    <div className="cr-page">
      <PageHead
        eyebrow="Account"
        title="Personal info"
        lead="Manage how you sign in, where we ship your cards, and how we contact you."
      />

      <FlashBanner />

      <div className="cr-personal-grid">
        <div className="cr-side">
          <div className="cr-side-card">
            <div
              style={{
                width: 72,
                height: 72,
                margin: "0 auto 10px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #d9a022, #f6c64a)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              {(viewer.displayName || "Y").charAt(0).toUpperCase()}
            </div>
            <strong style={{ display: "block", fontSize: 14 }}>
              {viewer.displayName}
            </strong>
            <small
              className="cr-mute"
              style={{ display: "block", fontSize: 11.5, marginTop: 2 }}
            >
              {viewer.authSource === "line" ? "LINE login" : "Email login"}
            </small>
            {viewer.adminRole && (
              <span
                className="cr-pill cr-pill-mint"
                style={{ marginTop: 10 }}
              >
                {viewer.adminRole.toUpperCase()}
              </span>
            )}
          </div>
          <div className="cr-side-nav">
            <button
              type="button"
              className={section === "profile" ? "active" : ""}
              onClick={() => setSection("profile")}
            >
              <span className="ico">
                <Ico name="user" size={14} />
              </span>
              <span>Profile details</span>
            </button>
            <button
              type="button"
              className={section === "connections" ? "active" : ""}
              onClick={() => setSection("connections")}
            >
              <span className="ico">
                <Ico name="card" size={14} />
              </span>
              <span>Connections</span>
              <span className="count">
                {
                  [connections.line, connections.google, connections.email].filter(
                    (c) => c.connected,
                  ).length
                }
                /3
              </span>
            </button>
            <button
              type="button"
              className={section === "addresses" ? "active" : ""}
              onClick={() => setSection("addresses")}
            >
              <span className="ico">
                <Ico name="pin" size={14} />
              </span>
              <span>Addresses</span>
              <span className="count">{addressRows.length}</span>
            </button>
            <button
              type="button"
              className={section === "shipping" ? "active" : ""}
              onClick={() => setSection("shipping")}
            >
              <span className="ico">
                <Ico name="truck" size={14} />
              </span>
              <span>Shipping history</span>
              <span className="count">{shipping.length}</span>
            </button>
          </div>
          <div
            style={{
              padding: 14,
              background: "var(--cr-paper-2)",
              border: "1px dashed var(--cr-line-strong)",
              borderRadius: "var(--cr-r-md)",
              fontSize: 12,
              color: "var(--cr-mute)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--cr-ink)" }}>Need help?</strong>{" "}
            Add a backup sign-in so you never lose access if LINE is unavailable.
          </div>
        </div>

        <div>
          {section === "profile" && (
            <ProfileSection onAddressSynced={syncAddress} />
          )}
          {section === "connections" && (
            <ConnectionsSection
              connections={connections}
              links={links}
              primaryKey={viewer.authSource === "line" ? "line" : null}
            />
          )}
          {section === "addresses" && (
            <AddressesSection addresses={addressRows} />
          )}
          {section === "shipping" && (
            <ShippingHistorySection shipping={shipping} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({
  onAddressSynced,
}: {
  onAddressSynced: (address: YnotAddress) => void;
}) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<ProfileDraft>(emptyProfile);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/lucky-draw/profile", {
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Profile could not be loaded.",
          );
        }
        const profile =
          isRecord(payload) && isRecord(payload.profile)
            ? (payload.profile as Partial<ProfileDraft>)
            : null;
        const next = { ...emptyProfile, ...(profile ?? {}) };
        setSaved(next);
        setDraft(next);
        setLoaded(true);
      } catch (error) {
        if (!active) return;
        setLoaded(true);
        toast(
          "error",
          error instanceof Error ? error.message : "Profile could not load.",
        );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [toast]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function update<K extends keyof ProfileDraft>(key: K, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!dirty) return;
    startTransition(async () => {
      try {
        const response = await fetch("/api/lucky-draw/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Profile could not be saved.",
          );
        }
        const profile =
          isRecord(payload) && isRecord(payload.profile)
            ? (payload.profile as Partial<ProfileDraft>)
            : null;
        const defaultAddress =
          isRecord(payload) && isRecord(payload.defaultAddress)
            ? (payload.defaultAddress as YnotAddress)
            : null;
        const next = { ...emptyProfile, ...(profile ?? {}) };
        setSaved(next);
        setDraft(next);
        if (defaultAddress) onAddressSynced(defaultAddress);
        toast("success", "Personal info saved.");
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Could not save.",
        );
      }
    });
  }

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow">Profile</span>
          <h3>How we contact and ship to you</h3>
        </div>
        <div className="cr-row" style={{ gap: 8 }}>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={() => setDraft(saved)}
            disabled={!dirty || pending}
          >
            Discard
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary cr-btn-sm"
            onClick={save}
            disabled={!dirty || pending || !loaded}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      <div className="cr-section-body">
        <div className="cr-grid-2">
          <div className="cr-field">
            <label htmlFor="cr-profile-fullname">Full name</label>
            <input
              id="cr-profile-fullname"
              autoComplete="name"
              disabled={!loaded}
              value={draft.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Your legal full name"
            />
            <small>We use this on shipping labels.</small>
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-phone">Phone</label>
            <input
              id="cr-profile-phone"
              autoComplete="tel"
              disabled={!loaded}
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="e.g. +66 92 188 7423"
            />
          </div>
          <div className="cr-field cr-field-full">
            <label htmlFor="cr-profile-address1">Default address line 1</label>
            <input
              id="cr-profile-address1"
              autoComplete="address-line1"
              disabled={!loaded}
              value={draft.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              placeholder="House, building, street"
            />
          </div>
          <div className="cr-field cr-field-full">
            <label htmlFor="cr-profile-address2">Default address line 2</label>
            <input
              id="cr-profile-address2"
              autoComplete="address-line2"
              disabled={!loaded}
              value={draft.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
              placeholder="Floor, room, landmark"
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-subdistrict">Subdistrict</label>
            <input
              id="cr-profile-subdistrict"
              autoComplete="address-level3"
              disabled={!loaded}
              value={draft.subdistrict}
              onChange={(e) => update("subdistrict", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-district">District</label>
            <input
              id="cr-profile-district"
              autoComplete="address-level2"
              disabled={!loaded}
              value={draft.district}
              onChange={(e) => update("district", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-province">Province</label>
            <input
              id="cr-profile-province"
              autoComplete="address-level1"
              disabled={!loaded}
              value={draft.province}
              onChange={(e) => update("province", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-postal">Postal code</label>
            <input
              id="cr-profile-postal"
              autoComplete="postal-code"
              disabled={!loaded}
              inputMode="numeric"
              value={draft.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-country">Country</label>
            <input
              id="cr-profile-country"
              autoComplete="country-name"
              disabled={!loaded}
              value={draft.country}
              onChange={(e) => update("country", e.target.value)}
            />
          </div>
          <div className="cr-field cr-field-full">
            <label htmlFor="cr-profile-delivery">Delivery note</label>
            <textarea
              id="cr-profile-delivery"
              disabled={!loaded}
              value={draft.deliveryNote}
              onChange={(e) => update("deliveryNote", e.target.value)}
              placeholder="Anything the shipping team should know"
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionsSection({
  connections,
  links,
  primaryKey,
}: {
  connections: PersonalInfoExperienceProps["connections"];
  links: PersonalInfoExperienceProps["links"];
  primaryKey: "line" | "google" | "email" | null;
}) {
  const rows: {
    key: "line" | "google" | "email";
    name: string;
    sub: string;
    logo: string;
    href?: string;
  }[] = [
    {
      key: "line",
      name: "LINE",
      sub: connections.line.connected
        ? connections.line.label ?? "Active"
        : "Not connected",
      logo: "line",
      href: links.lineHref,
    },
    {
      key: "google",
      name: "Google",
      sub: connections.google.connected
        ? connections.google.label ?? "Active"
        : "Not connected",
      logo: "google",
      href: links.googleConnectHref,
    },
    {
      key: "email",
      name: "Email + password",
      sub: connections.email.connected ? "Password set" : "Not set",
      logo: "email",
      href: links.emailConnectHref,
    },
  ];

  const connectedCount = rows.filter((row) =>
    row.key === "line"
      ? connections.line.connected
      : row.key === "google"
        ? connections.google.connected
        : connections.email.connected,
  ).length;

  // When the user only has one sign-in method, nudge them to add a second one
  // for account recovery. Reuse the existing connect hrefs so this card
  // doesn't introduce new auth surface.
  const recoveryPrompt =
    connectedCount === 1
      ? (() => {
          if (!connections.line.connected) {
            return { provider: "LINE", href: links.lineHref };
          }
          if (!connections.email.connected && links.emailConnectHref) {
            return { provider: "email", href: links.emailConnectHref };
          }
          if (!connections.google.connected && links.googleConnectHref) {
            return { provider: "Google", href: links.googleConnectHref };
          }
          return null;
        })()
      : null;

  return (
    <div className="cr-section">
      {recoveryPrompt && (
        <div
          className="cr-conn-card"
          style={{
            background: "rgba(244,197,66,0.10)",
            borderColor: "rgba(244,197,66,0.25)",
            marginBottom: 12,
          }}
        >
          <div className="cr-row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cr-conn-logo" style={{ background: "rgba(244,197,66,0.2)" }}>
              <Ico name="mail" size={14} />
            </span>
            <div style={{ flex: 1 }}>
              <strong>Add a second sign-in method</strong>
              <small className="cr-mute" style={{ display: "block", marginTop: 2 }}>
                Connect {recoveryPrompt.provider} so you can recover access if you lose your other sign-in.
              </small>
            </div>
            <a
              className="cr-btn cr-btn-primary cr-btn-sm"
              href={recoveryPrompt.href}
            >
              Connect {recoveryPrompt.provider}
            </a>
          </div>
        </div>
      )}
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow">Sign-in</span>
          <h3>Connected methods</h3>
        </div>
        <small className="cr-mute">{connectedCount} of 3 set</small>
      </div>
      <div className="cr-conn-grid">
        {rows.map((row, i) => {
          const conn =
            row.key === "line"
              ? connections.line
              : row.key === "google"
                ? connections.google
                : connections.email;
          const isPrimary = primaryKey === row.key;
          return (
            <div
              key={row.key}
              className={`cr-conn-card ${i ? "with-border" : ""}`}
            >
              <div className="cr-row" style={{ gap: 10 }}>
                <span className={`cr-conn-logo ${row.logo}`}>
                  {row.logo === "email" ? (
                    <Ico name="mail" size={14} />
                  ) : (
                    row.name.charAt(0)
                  )}
                </span>
                <strong style={{ flex: 1 }}>{row.name}</strong>
                {conn.connected && (
                  <span className="cr-pill cr-pill-mint">Active</span>
                )}
                {isPrimary && <span className="cr-pill">Primary</span>}
              </div>
              <small className="cr-mute" style={{ minHeight: 16 }}>
                {row.sub}
              </small>
              {conn.connected ? (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm cr-btn-block"
                  disabled
                  title={
                    isPrimary
                      ? "Cannot disconnect the primary sign-in"
                      : "Disconnect from the account settings"
                  }
                >
                  Connected
                </button>
              ) : row.href ? (
                <a
                  className="cr-btn cr-btn-primary cr-btn-sm cr-btn-block"
                  href={row.href}
                >
                  Connect {row.name}
                </a>
              ) : (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm cr-btn-block"
                  disabled
                >
                  Not available
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type NewAddress = {
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  district: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
};

const emptyAddress: NewAddress = {
  label: "Home",
  recipientName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  district: "",
  province: "",
  postalCode: "",
  isDefault: false,
};

function AddressesSection({ addresses }: { addresses: YnotAddress[] }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewAddress>(emptyAddress);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof NewAddress>(key: K, value: NewAddress[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    if (!draft.addressLine1.trim()) {
      toast("error", "Address line 1 is required.");
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/ynot/addresses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            isDefault: addresses.length === 0 ? true : draft.isDefault,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Could not save address.",
          );
        }
        toast("success", "Address saved.");
        setAdding(false);
        setDraft(emptyAddress);
        // Refresh server data so the new address shows up.
        window.location.assign("/profile/personal-info");
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Could not save address.",
        );
      }
    });
  }

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow">Shipping addresses</span>
          <h3>
            Saved {addresses.length}
            {addresses.length === 1 ? "" : "es"}
          </h3>
        </div>
        <button
          type="button"
          className="cr-btn cr-btn-primary cr-btn-sm"
          onClick={() => {
            setDraft(emptyAddress);
            setAdding(true);
          }}
        >
          <Ico name="plus" size={12} /> Add address
        </button>
      </div>
      <div className="cr-section-body cr-address-grid">
        {addresses.length === 0 ? (
          <div
              className="cr-address-empty"
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--cr-mute)",
              }}
          >
            No saved addresses yet. Add one above to enable physical shipping.
          </div>
        ) : (
          addresses.map((address) => (
            <div
              key={address.id}
              className={`cr-addr-card ${address.isDefault ? "default" : ""}`}
            >
              <span className="cr-addr-pin">
                <Ico name="pin" size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="cr-row"
                  style={{ gap: 6, flexWrap: "wrap" }}
                >
                  <h4>{address.label || "Address"}</h4>
                  {address.isDefault && (
                    <span className="cr-pill cr-pill-ink">Default</span>
                  )}
                </div>
                {address.recipientName && (
                  <div className="lines">
                    <strong style={{ color: "var(--cr-ink)" }}>
                      {address.recipientName}
                    </strong>
                    {address.phone ? ` · ${address.phone}` : ""}
                  </div>
                )}
                <div className="lines">{address.addressLine1}</div>
                {address.addressLine2 && (
                  <div className="lines">{address.addressLine2}</div>
                )}
                <div className="lines">
                  {[
                    address.subdistrict,
                    address.district,
                    address.province,
                    address.postalCode,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </div>
                {address.deliveryNote && (
                  <small className="cr-mute">{address.deliveryNote}</small>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={adding}
        onClose={() => {
          if (!pending) setAdding(false);
        }}
        eyebrow="Add"
        title="New shipping address"
        size="md"
        footer={
          <>
            <button
              type="button"
              className="cr-btn"
              onClick={() => setAdding(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-primary"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Saving…" : "Add address"}
            </button>
          </>
        }
      >
        <div className="cr-stack" style={{ gap: 12 }}>
          <div className="cr-field">
            <label htmlFor="cr-addr-label">Label (Home, Studio…)</label>
            <input
              id="cr-addr-label"
              value={draft.label}
              onChange={(e) => update("label", e.target.value)}
            />
          </div>
          <div className="cr-grid-2">
            <div className="cr-field">
              <label htmlFor="cr-addr-name">Recipient name</label>
              <input
                id="cr-addr-name"
                value={draft.recipientName}
                onChange={(e) => update("recipientName", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-phone">Phone</label>
              <input
                id="cr-addr-phone"
                value={draft.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>
          <div className="cr-field">
            <label htmlFor="cr-addr-line1">Street / building</label>
            <input
              id="cr-addr-line1"
              value={draft.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              placeholder="e.g. 188/22 Phra Khanong Nuea, Watthana"
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-addr-line2">Building / floor (optional)</label>
            <input
              id="cr-addr-line2"
              value={draft.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
            />
          </div>
          <div className="cr-grid-3">
            <div className="cr-field">
              <label htmlFor="cr-addr-district">District</label>
              <input
                id="cr-addr-district"
                value={draft.district}
                onChange={(e) => update("district", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-province">Province</label>
              <input
                id="cr-addr-province"
                value={draft.province}
                onChange={(e) => update("province", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-postal">Postal code</label>
              <input
                id="cr-addr-postal"
                value={draft.postalCode}
                onChange={(e) => update("postalCode", e.target.value)}
              />
            </div>
          </div>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => update("isDefault", e.target.checked)}
            />
            Use this as my default shipping address
          </label>
        </div>
      </Modal>
    </div>
  );
}

function ShippingHistorySection({
  shipping,
}: {
  shipping: YnotShippingRequest[];
}) {
  const [filter, setFilter] = useState<"all" | "open" | "delivered">("all");

  const filtered = shipping.filter((shp) => {
    if (filter === "all") return true;
    if (filter === "delivered") return shp.status === "delivered";
    return shp.status !== "delivered" && shp.status !== "cancelled";
  });

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow">Shipping</span>
          <h3>Shipment history</h3>
        </div>
        <div className="cr-row" style={{ gap: 4 }}>
          {(
            [
              { id: "all", label: "All" },
              { id: "open", label: "In progress" },
              { id: "delivered", label: "Delivered" },
            ] as { id: "all" | "open" | "delivered"; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cr-btn cr-btn-sm ${
                filter === f.id ? "cr-btn-primary" : "cr-btn-ghost"
              }`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--cr-mute)",
              fontSize: 13,
            }}
          >
            No shipments match this filter.
          </div>
        ) : (
          filtered.map((shp, i) => (
            <div
              key={shp.id}
              className={`cr-shipment-row ${i ? "with-border" : ""}`}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--cr-bg-soft)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ico name="truck" size={18} />
              </span>
              <div className="cr-stack" style={{ gap: 2 }}>
                <strong style={{ fontSize: 13.5 }}>{shp.publicCode}</strong>
                <small className="cr-mute" style={{ fontSize: 11 }}>
                  Created {new Date(shp.createdAt).toLocaleDateString()}
                </small>
              </div>
              <div className="cr-stack" style={{ gap: 2 }}>
                <span className="cr-eyebrow">Tracking</span>
                <span className="cr-mono" style={{ fontSize: 11.5 }}>
                  {shp.trackingProvider && shp.trackingNumber
                    ? `${shp.trackingProvider} · ${shp.trackingNumber}`
                    : "Pending pickup"}
                </span>
              </div>
              <span
                className={`cr-pill ${
                  shp.status === "delivered"
                    ? "cr-pill-mint"
                    : shp.status === "cancelled"
                      ? "cr-pill-rose"
                      : "cr-pill-blue"
                }`}
              >
                {shp.status.replace(/_/g, " ")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
