"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  YnotAddress,
  YnotShippingRequest,
  YnotViewer,
} from "../types";
import {
  isFinalYnotShippingStatus,
  ynotShippingStatusCustomerLabel,
  ynotShippingTrackingLabel,
} from "../shipping-status";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, localized, type Language } from "../i18n";
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

function localizedProfileError(message: string, language: Language): string {
  if (language !== "th") return message;
  const normalized = message.trim().toLowerCase();
  if (normalized === "profile was not found.") return "ไม่พบโปรไฟล์";
  if (normalized === "profile could not be loaded.") return "โหลดโปรไฟล์ไม่สำเร็จ";
  if (normalized === "profile could not be saved.") return "บันทึกโปรไฟล์ไม่สำเร็จ";
  return message;
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
  const language = useStoreLanguage();
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
        eyebrow={<I18nText en="Account" th="บัญชี" />}
        title={<I18nText en="Personal info" th="ข้อมูลส่วนตัว" />}
        lead={
          <I18nText
            en="Manage how you sign in, where we ship your cards, and how we contact you."
            th="จัดการวิธีเข้าสู่ระบบ ที่อยู่จัดส่งการ์ด และช่องทางติดต่อของคุณ"
          />
        }
      />

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
              {viewer.authSource === "line"
                ? localized({ en: "LINE login", th: "เข้าสู่ระบบด้วย LINE" }, language)
                : localized({ en: "Email login", th: "เข้าสู่ระบบด้วยอีเมล" }, language)}
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
              <span><I18nText en="Profile details" th="รายละเอียดโปรไฟล์" /></span>
            </button>
            <button
              type="button"
              className={section === "connections" ? "active" : ""}
              onClick={() => setSection("connections")}
            >
              <span className="ico">
                <Ico name="card" size={14} />
              </span>
              <span><I18nText en="Connections" th="การเชื่อมต่อ" /></span>
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
              <span><I18nText en="Addresses" th="ที่อยู่" /></span>
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
              <span><I18nText en="Shipping history" th="ประวัติการจัดส่ง" /></span>
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
            <strong style={{ color: "var(--cr-ink)" }}>
              <I18nText en="Need help?" th="ต้องการความช่วยเหลือ?" />
            </strong>{" "}
            <I18nText
              en="Add a backup sign-in so you never lose access if LINE is unavailable."
              th="เพิ่มวิธีเข้าสู่ระบบสำรอง เพื่อไม่ให้เสียสิทธิ์เข้าถึงบัญชีหาก LINE ใช้งานไม่ได้"
            />
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
  const language = useStoreLanguage();
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
              ? localizedProfileError(payload.error, language)
              : localized(
                  {
                    en: "Profile could not be loaded.",
                    th: "โหลดโปรไฟล์ไม่สำเร็จ",
                  },
                  language,
                ),
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
          error instanceof Error
            ? error.message
            : localized(
                { en: "Profile could not load.", th: "โหลดโปรไฟล์ไม่สำเร็จ" },
                language,
              ),
        );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [language, toast]);

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
              ? localizedProfileError(payload.error, language)
              : localized(
                  {
                    en: "Profile could not be saved.",
                    th: "บันทึกโปรไฟล์ไม่สำเร็จ",
                  },
                  language,
                ),
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
        toast(
          "success",
          localized({ en: "Personal info saved.", th: "บันทึกข้อมูลส่วนตัวแล้ว" }, language),
        );
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? error.message
            : localized({ en: "Could not save.", th: "บันทึกไม่สำเร็จ" }, language),
        );
      }
    });
  }

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow"><I18nText en="Profile" th="โปรไฟล์" /></span>
          <h3><I18nText en="How we contact and ship to you" th="ข้อมูลติดต่อและที่อยู่จัดส่ง" /></h3>
        </div>
        <div className="cr-row" style={{ gap: 8 }}>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={() => setDraft(saved)}
            disabled={!dirty || pending}
          >
            <I18nText en="Discard" th="ยกเลิกการแก้ไข" />
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary cr-btn-sm"
            onClick={save}
            disabled={!dirty || pending || !loaded}
          >
            {pending
              ? localized({ en: "Saving...", th: "กำลังบันทึก..." }, language)
              : localized({ en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" }, language)}
          </button>
        </div>
      </div>
      <div className="cr-section-body">
        <div className="cr-grid-2">
          <div className="cr-field">
            <label htmlFor="cr-profile-fullname">
              <I18nText en="Full name" th="ชื่อ-นามสกุล" />
            </label>
            <input
              id="cr-profile-fullname"
              autoComplete="name"
              disabled={!loaded}
              value={draft.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder={localized(
                { en: "Your legal full name", th: "ชื่อ-นามสกุลตามจริง" },
                language,
              )}
            />
            <small>
              <I18nText en="We use this on shipping labels." th="เราใช้ชื่อนี้บนฉลากจัดส่ง" />
            </small>
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-phone"><I18nText en="Phone" th="เบอร์โทร" /></label>
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
            <label htmlFor="cr-profile-address1">
              <I18nText en="Default address line 1" th="ที่อยู่หลัก บรรทัดที่ 1" />
            </label>
            <input
              id="cr-profile-address1"
              autoComplete="address-line1"
              disabled={!loaded}
              value={draft.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              placeholder={localized(
                { en: "House, building, street", th: "บ้าน อาคาร ถนน" },
                language,
              )}
            />
          </div>
          <div className="cr-field cr-field-full">
            <label htmlFor="cr-profile-address2">
              <I18nText en="Default address line 2" th="ที่อยู่หลัก บรรทัดที่ 2" />
            </label>
            <input
              id="cr-profile-address2"
              autoComplete="address-line2"
              disabled={!loaded}
              value={draft.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
              placeholder={localized(
                { en: "Floor, room, landmark", th: "ชั้น ห้อง จุดสังเกต" },
                language,
              )}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-subdistrict">
              <I18nText en="Subdistrict" th="แขวง/ตำบล" />
            </label>
            <input
              id="cr-profile-subdistrict"
              autoComplete="address-level3"
              disabled={!loaded}
              value={draft.subdistrict}
              onChange={(e) => update("subdistrict", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-district"><I18nText en="District" th="เขต/อำเภอ" /></label>
            <input
              id="cr-profile-district"
              autoComplete="address-level2"
              disabled={!loaded}
              value={draft.district}
              onChange={(e) => update("district", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-province"><I18nText en="Province" th="จังหวัด" /></label>
            <input
              id="cr-profile-province"
              autoComplete="address-level1"
              disabled={!loaded}
              value={draft.province}
              onChange={(e) => update("province", e.target.value)}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-profile-postal"><I18nText en="Postal code" th="รหัสไปรษณีย์" /></label>
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
            <label htmlFor="cr-profile-country"><I18nText en="Country" th="ประเทศ" /></label>
            <input
              id="cr-profile-country"
              autoComplete="country-name"
              disabled={!loaded}
              value={draft.country}
              onChange={(e) => update("country", e.target.value)}
            />
          </div>
          <div className="cr-field cr-field-full">
            <label htmlFor="cr-profile-delivery"><I18nText en="Delivery note" th="หมายเหตุจัดส่ง" /></label>
            <textarea
              id="cr-profile-delivery"
              disabled={!loaded}
              value={draft.deliveryNote}
              onChange={(e) => update("deliveryNote", e.target.value)}
              placeholder={localized(
                {
                  en: "Anything the shipping team should know",
                  th: "รายละเอียดเพิ่มเติมที่ทีมจัดส่งควรรู้",
                },
                language,
              )}
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
  const language = useStoreLanguage();
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
        ? connections.line.label ?? localized({ en: "Active", th: "ใช้งานอยู่" }, language)
        : localized({ en: "Not connected", th: "ยังไม่เชื่อมต่อ" }, language),
      logo: "line",
      href: links.lineHref,
    },
    {
      key: "google",
      name: "Google",
      sub: connections.google.connected
        ? connections.google.label ?? localized({ en: "Active", th: "ใช้งานอยู่" }, language)
        : localized({ en: "Not connected", th: "ยังไม่เชื่อมต่อ" }, language),
      logo: "google",
      href: links.googleConnectHref,
    },
    {
      key: "email",
      name: localized({ en: "Email + password", th: "อีเมล + รหัสผ่าน" }, language),
      sub: connections.email.connected
        ? localized({ en: "Password set", th: "ตั้งรหัสผ่านแล้ว" }, language)
        : localized({ en: "Not set", th: "ยังไม่ได้ตั้งค่า" }, language),
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

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow"><I18nText en="Sign-in" th="เข้าสู่ระบบ" /></span>
          <h3><I18nText en="Connected methods" th="วิธีที่เชื่อมต่อแล้ว" /></h3>
        </div>
        <small className="cr-mute">
          {language === "th" ? `ตั้งค่าแล้ว ${connectedCount} จาก 3` : `${connectedCount} of 3 set`}
        </small>
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
                  <span className="cr-pill cr-pill-mint">
                    <I18nText en="Active" th="ใช้งานอยู่" />
                  </span>
                )}
                {isPrimary && (
                  <span className="cr-pill"><I18nText en="Primary" th="หลัก" /></span>
                )}
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
                      ? localized(
                          {
                            en: "Cannot disconnect the primary sign-in",
                            th: "ไม่สามารถยกเลิกวิธีเข้าสู่ระบบหลักได้",
                          },
                          language,
                        )
                      : localized(
                          {
                            en: "Disconnect from the account settings",
                            th: "ยกเลิกได้จากหน้าตั้งค่าบัญชี",
                          },
                          language,
                        )
                  }
                >
                  <I18nText en="Connected" th="เชื่อมต่อแล้ว" />
                </button>
              ) : row.href ? (
                <a
                  className="cr-btn cr-btn-primary cr-btn-sm cr-btn-block"
                  href={row.href}
                >
                  {language === "th" ? `เชื่อม ${row.name}` : `Connect ${row.name}`}
                </a>
              ) : (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm cr-btn-block"
                  disabled
                >
                  <I18nText en="Not available" th="ยังไม่พร้อมใช้งาน" />
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
  const language = useStoreLanguage();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewAddress>(emptyAddress);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof NewAddress>(key: K, value: NewAddress[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    if (!draft.addressLine1.trim()) {
      toast(
        "error",
        localized(
          { en: "Address line 1 is required.", th: "กรุณากรอกที่อยู่บรรทัดที่ 1" },
          language,
        ),
      );
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
              : localized(
                  { en: "Could not save address.", th: "บันทึกที่อยู่ไม่สำเร็จ" },
                  language,
                ),
          );
        }
        toast("success", localized({ en: "Address saved.", th: "บันทึกที่อยู่แล้ว" }, language));
        setAdding(false);
        setDraft(emptyAddress);
        // Refresh server data so the new address shows up.
        window.location.assign("/profile/personal-info");
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? error.message
            : localized(
                { en: "Could not save address.", th: "บันทึกที่อยู่ไม่สำเร็จ" },
                language,
              ),
        );
      }
    });
  }

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow">
            <I18nText en="Shipping addresses" th="ที่อยู่จัดส่ง" />
          </span>
          <h3>
            {language === "th"
              ? `บันทึกไว้ ${addresses.length} ที่อยู่`
              : `Saved ${addresses.length}${addresses.length === 1 ? "" : "es"}`}
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
          <Ico name="plus" size={12} /> <I18nText en="Add address" th="เพิ่มที่อยู่" />
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
            <I18nText
              en="No saved addresses yet. Add one above to enable physical shipping."
              th="ยังไม่มีที่อยู่ที่บันทึกไว้ เพิ่มที่อยู่เพื่อใช้จัดส่งการ์ด"
            />
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
                    <span className="cr-pill cr-pill-ink">
                      <I18nText en="Default" th="ค่าเริ่มต้น" />
                    </span>
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
        eyebrow={<I18nText en="Add" th="เพิ่ม" />}
        title={<I18nText en="New shipping address" th="ที่อยู่จัดส่งใหม่" />}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="cr-btn"
            onClick={() => setAdding(false)}
            disabled={pending}
          >
              <I18nText en="Cancel" th="ยกเลิก" />
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-primary"
            onClick={submit}
            disabled={pending}
          >
              {pending
                ? localized({ en: "Saving...", th: "กำลังบันทึก..." }, language)
                : localized({ en: "Add address", th: "เพิ่มที่อยู่" }, language)}
            </button>
          </>
        }
      >
        <div className="cr-stack" style={{ gap: 12 }}>
          <div className="cr-field">
            <label htmlFor="cr-addr-label">
              <I18nText en="Label (Home, Studio...)" th="ชื่อที่อยู่ (บ้าน, สตูดิโอ...)" />
            </label>
            <input
              id="cr-addr-label"
              value={draft.label}
              onChange={(e) => update("label", e.target.value)}
            />
          </div>
          <div className="cr-grid-2">
            <div className="cr-field">
              <label htmlFor="cr-addr-name"><I18nText en="Recipient name" th="ชื่อผู้รับ" /></label>
              <input
                id="cr-addr-name"
                value={draft.recipientName}
                onChange={(e) => update("recipientName", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-phone"><I18nText en="Phone" th="เบอร์โทร" /></label>
              <input
                id="cr-addr-phone"
                value={draft.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>
          <div className="cr-field">
            <label htmlFor="cr-addr-line1">
              <I18nText en="Street / building" th="ถนน / อาคาร" />
            </label>
            <input
              id="cr-addr-line1"
              value={draft.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              placeholder={localized(
                {
                  en: "e.g. 188/22 Phra Khanong Nuea, Watthana",
                  th: "เช่น 188/22 พระโขนงเหนือ เขตวัฒนา",
                },
                language,
              )}
            />
          </div>
          <div className="cr-field">
            <label htmlFor="cr-addr-line2">
              <I18nText en="Building / floor (optional)" th="อาคาร / ชั้น (ไม่บังคับ)" />
            </label>
            <input
              id="cr-addr-line2"
              value={draft.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
            />
          </div>
          <div className="cr-grid-3">
            <div className="cr-field">
              <label htmlFor="cr-addr-district"><I18nText en="District" th="เขต/อำเภอ" /></label>
              <input
                id="cr-addr-district"
                value={draft.district}
                onChange={(e) => update("district", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-province"><I18nText en="Province" th="จังหวัด" /></label>
              <input
                id="cr-addr-province"
                value={draft.province}
                onChange={(e) => update("province", e.target.value)}
              />
            </div>
            <div className="cr-field">
              <label htmlFor="cr-addr-postal"><I18nText en="Postal code" th="รหัสไปรษณีย์" /></label>
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
            <I18nText
              en="Use this as my default shipping address"
              th="ใช้เป็นที่อยู่จัดส่งเริ่มต้น"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function shippingRewardLabel(request: YnotShippingRequest, language: Language) {
  const firstItem = request.items?.[0];
  const itemCount = request.items?.length ?? 0;
  if (!firstItem) {
    return localized(
      { en: "Reward details pending", th: "รอรายละเอียดของรางวัล" },
      language,
    );
  }
  return `${firstItem.cardName}${itemCount > 1 ? ` +${itemCount - 1}` : ""}`;
}

function shippingSourceLabel(request: YnotShippingRequest, language: Language) {
  return request.items?.[0]?.sourceCampaignTitle ??
    localized({ en: "Pack source pending", th: "รอข้อมูลแพ็กต้นทาง" }, language);
}

function ShippingHistorySection({
  shipping,
}: {
  shipping: YnotShippingRequest[];
}) {
  const language = useStoreLanguage();
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");

  const filtered = shipping.filter((shp) => {
    if (filter === "all") return true;
    if (filter === "completed") return isFinalYnotShippingStatus(shp.status);
    return !isFinalYnotShippingStatus(shp.status);
  });

  return (
    <div className="cr-section">
      <div className="cr-section-head">
        <div className="cr-stack" style={{ gap: 2 }}>
          <span className="cr-eyebrow"><I18nText en="Shipping" th="การจัดส่ง" /></span>
          <h3><I18nText en="Shipment history" th="ประวัติการจัดส่ง" /></h3>
        </div>
        <div className="cr-row" style={{ gap: 4 }}>
          {(
            [
              { id: "all", label: language === "th" ? "ทั้งหมด" : "All" },
              { id: "open", label: language === "th" ? "กำลังดำเนินการ" : "In progress" },
              { id: "completed", label: language === "th" ? "เสร็จแล้ว" : "Completed" },
            ] as { id: "all" | "open" | "completed"; label: string }[]
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
            <I18nText
              en="No shipments match this filter."
              th="ไม่มีรายการจัดส่งตรงกับตัวกรองนี้"
            />
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
                  {language === "th" ? "สร้างเมื่อ" : "Created"}{" "}
                  {new Date(shp.createdAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US")}
                </small>
              </div>
              <div className="cr-stack" style={{ gap: 2 }}>
                <span className="cr-eyebrow"><I18nText en="Reward" th="ของรางวัล" /></span>
                <span style={{ fontSize: 12.5 }}>
                  {shippingRewardLabel(shp, language)}
                </span>
                <small className="cr-mute" style={{ fontSize: 11 }}>
                  {language === "th" ? "แพ็ก:" : "Pack:"}{" "}
                  {shippingSourceLabel(shp, language)}
                </small>
              </div>
              <div className="cr-stack" style={{ gap: 2 }}>
                <span className="cr-eyebrow"><I18nText en="Tracking" th="ติดตามพัสดุ" /></span>
                <span className="cr-mono" style={{ fontSize: 11.5 }}>
                  {ynotShippingTrackingLabel(shp, language)}
                </span>
              </div>
              <span
                className={`cr-pill ${
                  shp.status === "cancelled"
                      ? "cr-pill-rose"
                      : isFinalYnotShippingStatus(shp.status)
                        ? "cr-pill-mint"
                      : "cr-pill-blue"
                }`}
              >
                {ynotShippingStatusCustomerLabel(shp.status, language)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
