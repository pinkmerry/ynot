"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GachaRevealOverlay } from "./GachaRevealOverlay";
import { CoinPip, formatCoins } from "./cr/Icons";
import { I18nText, i18n, localized, type Language, type LocalizedCopy } from "./i18n";
import {
  localStockRewardPool,
  localStockSubSkuInitialState,
  localStockSubSkus,
  localStockSubSkuTotals,
  openLocalStockBoxes,
  openLocalStockPacks,
  type LocalStockReward,
  type LocalStockSubSkuState,
  type LocalStockTotals,
} from "./local-stock-subsku-mock";
import { useStoreLanguage } from "./StorePreferences";
import type { YnotGachaOpenItem, YnotGachaOpenResult } from "./types";

type Surface = "customer" | "admin";
type Copy = LocalizedCopy<string>;

function copy(en: string, th: string): Copy {
  return { en, th };
}

const localCampaign = {
  title: "OP16 Box Break Local Test",
  series: "pokemon",
  costCoins: 120,
  openOptions: [1, 3, 5],
  totalSlots: 58,
  walletBalance: 5000,
};

const tierValueThb: Record<LocalStockReward["tier"], number> = {
  rainbow: 5000,
  gold: 1500,
  silver: 750,
  bronze: 100,
};

function formatCount(value: number) {
  return value.toLocaleString();
}

function rewardToRevealItem(
  reward: LocalStockReward,
  index: number,
): YnotGachaOpenItem {
  return {
    name: reward.cardName,
    imageUrl: reward.imageUrl,
    displayTier: reward.tier,
    valueThb: tierValueThb[reward.tier],
    position: index + 1,
  };
}

function buildRevealResult(
  rewards: LocalStockReward[],
  remainingPacks: number,
): YnotGachaOpenResult {
  const lastPull = rewards[rewards.length - 1]?.pullNumber ?? 0;
  return {
    status: "completed",
    openId: `local-open-${lastPull}`,
    publicCode: `LOCAL-${String(lastPull).padStart(4, "0")}`,
    costCoins: rewards.length * localCampaign.costCoins,
    items: rewards.map(rewardToRevealItem),
    remaining: {
      remainingSlots: remainingPacks,
      availablePrizeUnits: remainingPacks,
      eligibleUnits: remainingPacks,
      availableWinSlots: remainingPacks,
    },
  };
}

function RewardThumb({ reward }: { reward: LocalStockReward }) {
  return (
    <span className="local-production-reward-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={reward.imageUrl} alt={reward.cardName} />
    </span>
  );
}

function RewardHistoryRow({ reward }: { reward: LocalStockReward }) {
  return (
    <article className="local-production-history-row">
      <RewardThumb reward={reward} />
      <span>
        <strong>{reward.cardName}</strong>
        <small>
          {reward.cardCode} · {reward.tier} ·{" "}
          <I18nText en={`pull #${reward.pullNumber}`} th={`เปิดครั้งที่ #${reward.pullNumber}`} />
        </small>
      </span>
      <code>{reward.sourceStockSku}</code>
    </article>
  );
}

function CustomerStatGrid({
  totals,
  selectedQuantity,
}: {
  totals: LocalStockTotals;
  selectedQuantity: number;
}) {
  const totalCost = selectedQuantity * localCampaign.costCoins;
  const stockPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (totals.availablePackEquivalent / localCampaign.totalSlots) * 100,
      ),
    ),
  );

  return (
    <div className="cr-detail-stats">
      <div className="stat">
        <span className="cr-eyebrow">
          <I18nText en="Price / pack" th="ราคา / ซอง" />
        </span>
        <strong>
          <CoinPip size={18} /> {formatCoins(localCampaign.costCoins)}
        </strong>
        <small className="cr-mute">
          <I18nText en="coins per open" th="เหรียญต่อครั้ง" />
        </small>
      </div>
      <div className="stat">
        <span className="cr-eyebrow">
          <I18nText en="Stock left" th="สต็อกคงเหลือ" />
        </span>
        <strong className="cr-tnum">
          {formatCount(totals.availablePackEquivalent)}
          <span className="local-production-muted-count">
            &nbsp;/ {formatCount(localCampaign.totalSlots)}
          </span>
        </strong>
        <div className="cr-progress" style={{ width: 96, marginTop: 2 }}>
          <span style={{ width: `${stockPct}%` }} />
        </div>
      </div>
      <div className="stat">
        <span className="cr-eyebrow">
          <I18nText en="Box stock" th="สต็อกกล่อง" />
        </span>
        <strong className="cr-tnum">{formatCount(totals.availableBoxes)}</strong>
        <small className="cr-mute">
          <I18nText
            en={`${formatCount(totals.boxPackEquivalent)} packs inside boxes`}
            th={`${formatCount(totals.boxPackEquivalent)} ซองในกล่อง`}
          />
        </small>
      </div>
      <div className="stat">
        <span className="cr-eyebrow">
          <I18nText en="This open" th="รอบนี้" />
        </span>
        <strong>
          <CoinPip size={18} /> {formatCoins(totalCost)}
        </strong>
        <small className="cr-mute">
          <I18nText en={`x${selectedQuantity} selected`} th={`เลือก x${selectedQuantity}`} />
        </small>
      </div>
    </div>
  );
}

function CustomerProductionFlow({
  state,
  totals,
  selectedQuantity,
  setSelectedQuantity,
  openPacks,
}: {
  state: LocalStockSubSkuState;
  totals: LocalStockTotals;
  selectedQuantity: number;
  setSelectedQuantity: (quantity: number) => void;
  openPacks: (quantity: number) => void;
}) {
  const soldOut = totals.availablePackEquivalent <= 0;
  const latestRewards = state.history.slice(0, 6);

  return (
    <div className="cr-page has-dock cr-detail-centered local-production-customer">
      <div className="cr-detail-hero-wrap">
        <div className="cr-detail-hero-art pokemon has-banner-image">
          <span className="cr-hero-glow" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden="true"
            className="cr-detail-hero-image"
            src={localStockSubSkus.box.imageUrl}
          />
          <span className="cr-pack-art-sticker">
            <I18nText en="Local" th="Local" />
          </span>
          {!soldOut ? (
            <span className="cr-hero-stock">
              {formatCount(totals.availablePackEquivalent)}/
              {formatCount(localCampaign.totalSlots)}
            </span>
          ) : null}
          <span className="cr-hero-eyebrow">POKEMON</span>
          <span className="cr-hero-footer">
            <I18nText en="OP16 LOCAL STOCK TEST" th="ทดสอบสต็อก OP16 บน LOCAL" />
          </span>
        </div>
      </div>

      <div className="cr-detail-info-card">
        <div className="cr-detail-tag-row">
          <span className="cr-pill cr-pill-ink">Pokemon</span>
          <span className="cr-pill"><I18nText en="Box to pack" th="กล่องเป็นซอง" /></span>
          <span className="cr-pill cr-pill-mint"><I18nText en="Mock wallet" th="กระเป๋าจำลอง" /></span>
          <span className="cr-pill cr-pill-blue"><I18nText en="Local only" th="เฉพาะ local" /></span>
        </div>

        <p className="cr-detail-desc">
          <I18nText
            en="Customer view rehearsal for buying packs from mixed stock. Box stock stays visible, loose packs decrement first, and a sealed box opens into child packs when loose stock is short."
            th="ซ้อมมุมมองลูกค้าสำหรับซื้อแพ็กจากสต็อกแบบผสม กล่องยังแสดงให้เห็น ซองแยกถูกตัดก่อน และเมื่อซองไม่พอระบบจะเปิดกล่องซีลเป็นซองลูก"
          />
        </p>

        <CustomerStatGrid totals={totals} selectedQuantity={selectedQuantity} />
      </div>

      <div className="cr-stack" style={{ gap: 18 }}>
        <section className="cr-section">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow"><I18nText en="Prize lineup" th="รายการรางวัล" /></span>
              <h3><I18nText en="What customers see before opening" th="สิ่งที่ลูกค้าเห็นก่อนเปิด" /></h3>
            </div>
            <small className="cr-mute">
              <I18nText
                en={`${localStockRewardPool.length} mock rewards`}
                th={`รางวัลจำลอง ${localStockRewardPool.length} รายการ`}
              />
            </small>
          </div>
          <div className="cr-prize-grid local-production-prize-grid">
            {localStockRewardPool.map((reward) => (
              <div className="cr-prize-card" key={reward.cardCode}>
                <div className={`cr-prize-card-art cr-coll-art ${reward.tier}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={reward.imageUrl} alt={reward.cardName} />
                </div>
                <div className="cr-prize-card-name">{reward.cardName}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="cr-section">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow"><I18nText en="Customer bag" th="กระเป๋าลูกค้า" /></span>
              <h3><I18nText en="Collection and all-pulls preview" th="ตัวอย่างคอลเลกชันและประวัติ all-pulls" /></h3>
            </div>
            <small className="cr-mute">
              <I18nText
                en={`${formatCount(state.bag.length)} owned reward${state.bag.length === 1 ? "" : "s"}`}
                th={`มีรางวัล ${formatCount(state.bag.length)} รายการ`}
              />
            </small>
          </div>
          {latestRewards.length ? (
            <div className="local-production-history-list">
              {latestRewards.map((reward) => (
                <RewardHistoryRow key={reward.id} reward={reward} />
              ))}
            </div>
          ) : (
            <p className="cr-mute local-production-empty">
              <I18nText
                en="No collection rows yet. Open x3 packs to see reward images in the same style as customer bag and all-pulls history."
                th="ยังไม่มีรายการคอลเลกชัน ลองเปิด x3 แพ็กเพื่อดูรูปรางวัลแบบเดียวกับถุงการ์ดลูกค้าและประวัติการเปิดทั้งหมด"
              />
            </p>
          )}
        </section>
      </div>

      {!soldOut ? (
        <div className="cr-dock" role="region" aria-label="Open this pack / เปิดแพ็กนี้">
          <div className="cr-dock-pack">
            <div className="cr-pack-art pokemon local-production-dock-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={localStockSubSkus.pack.imageUrl} alt="" />
            </div>
            <div className="cr-stack" style={{ gap: 2, minWidth: 0 }}>
              <small className="cr-eyebrow" style={{ fontSize: 9.5 }}>
                <I18nText en="Open this pack" th="เปิดแพ็กนี้" />
              </small>
              <strong className="local-production-dock-title">
                {localCampaign.title}
              </strong>
              <small className="cr-mute local-production-dock-subtitle">
                <CoinPip size={10} /> {formatCoins(localCampaign.costCoins)} /
                <I18nText
                  en={` pack · ${formatCount(totals.availablePackEquivalent)} left`}
                  th={` ซอง · เหลือ ${formatCount(totals.availablePackEquivalent)}`}
                />
              </small>
            </div>
          </div>

          <div className="cr-dock-qty">
            {localCampaign.openOptions.map((quantity) => (
              <button
                key={quantity}
                type="button"
                className={`cr-dock-qty-btn ${
                  selectedQuantity === quantity ? "active" : ""
                }`}
                onClick={() => setSelectedQuantity(quantity)}
                disabled={totals.availablePackEquivalent < quantity}
              >
                x{quantity}
              </button>
            ))}
          </div>

          <div className="cr-dock-cta">
            <div className="cr-dock-total">
              <small><I18nText en="Total" th="รวม" /></small>
              <strong className="cr-tnum">
                <CoinPip size={13} />{" "}
                {formatCoins(selectedQuantity * localCampaign.costCoins)}
              </strong>
            </div>
            <button
              type="button"
              className="cr-btn cr-btn-primary cr-btn-lg"
              onClick={() => openPacks(selectedQuantity)}
              disabled={totals.availablePackEquivalent < selectedQuantity}
            >
              <I18nText
                en={`Open ${selectedQuantity} pack${selectedQuantity === 1 ? "" : "s"}`}
                th={`เปิด ${selectedQuantity} ซอง`}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminStockRow({
  imageUrl,
  label,
  sku,
  kind,
  available,
  packEquivalent,
  detail,
}: {
  imageUrl: string;
  label: string;
  sku: string;
  kind: ReactNode;
  available: number;
  packEquivalent: number;
  detail: ReactNode;
}) {
  return (
    <article className="local-production-admin-stock-row">
      <span className="local-production-admin-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={label} />
      </span>
      <span>
        <strong>{label}</strong>
        <code>{sku}</code>
      </span>
      <span>{kind}</span>
      <span>{formatCount(available)}</span>
      <span>{formatCount(packEquivalent)}</span>
      <small>{detail}</small>
    </article>
  );
}

function AdminProductionFlow({
  state,
  totals,
  language,
  receiveBoxes,
  receiveLoosePacks,
  openBoxes,
}: {
  state: LocalStockSubSkuState;
  totals: LocalStockTotals;
  language: Language;
  receiveBoxes: (quantity: number) => void;
  receiveLoosePacks: (quantity: number) => void;
  openBoxes: (quantity: number) => void;
}) {
  return (
    <div className="local-production-admin">
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span><I18nText en="Admin stock control" th="ควบคุมสต็อกแอดมิน" /></span>
            <h3><I18nText en="Main SKU and Sub SKU inventory" th="คลัง Main SKU และ Sub SKU" /></h3>
          </div>
          <strong>
            <I18nText
              en={`${formatCount(totals.availablePackEquivalent)} packs sellable`}
              th={`ขายได้ ${formatCount(totals.availablePackEquivalent)} ซอง`}
            />
          </strong>
        </div>

        <div className="local-production-admin-actions">
          <button type="button" onClick={() => receiveBoxes(1)}>
            <I18nText en="Receive 1 box" th="รับเข้า 1 กล่อง" />
          </button>
          <button type="button" onClick={() => receiveLoosePacks(12)}>
            <I18nText en="Receive 12 loose packs" th="รับเข้า 12 ซองแยก" />
          </button>
          <button
            type="button"
            onClick={() => openBoxes(1)}
            disabled={state.boxStock <= 0}
          >
            <I18nText en="Convert 1 box to packs" th="แปลง 1 กล่องเป็นซอง" />
          </button>
        </div>

        <div className="local-production-admin-stock-table">
          <div className="local-production-admin-stock-head">
            <span>Sub SKU</span>
            <span><I18nText en="Kind" th="ชนิด" /></span>
            <span><I18nText en="Units" th="จำนวน" /></span>
            <span><I18nText en="Packs" th="ซอง" /></span>
            <span><I18nText en="Rule" th="กฎ" /></span>
          </div>
          <AdminStockRow
            imageUrl={localStockSubSkus.box.imageUrl}
            label={localStockSubSkus.box.label}
            sku={localStockSubSkus.box.sku}
            kind={i18n("box", "กล่อง")}
            available={state.boxStock}
            packEquivalent={totals.boxPackEquivalent}
            detail={i18n(`1 box = ${localStockSubSkus.box.childQuantity} packs`, `1 กล่อง = ${localStockSubSkus.box.childQuantity} ซอง`)}
          />
          <AdminStockRow
            imageUrl={localStockSubSkus.pack.imageUrl}
            label={localStockSubSkus.pack.label}
            sku={localStockSubSkus.pack.sku}
            kind={i18n("pack", "ซอง")}
            available={state.loosePackStock}
            packEquivalent={state.loosePackStock}
            detail={i18n("Child stock sold to customer opens", "สต็อกลูกที่ขายให้ลูกค้าเปิด")}
          />
        </div>
      </section>

      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span><I18nText en="Prize catalog usage" th="การใช้ catalog รางวัล" /></span>
            <h3><I18nText en="Images and reward destinations" th="รูปและปลายทางรางวัล" /></h3>
          </div>
          <strong>
            <I18nText
              en={`${formatCount(state.history.length)} pull rows`}
              th={`${formatCount(state.history.length)} แถว pull`}
            />
          </strong>
        </div>

        <div className="local-production-admin-prize-grid">
          {localStockRewardPool.map((reward) => (
            <article key={reward.cardCode} className="local-production-admin-prize">
              <RewardThumb
                reward={{
                  ...reward,
                  id: reward.cardCode,
                  pullNumber: 0,
                  sourceStockSku: localStockSubSkus.pack.sku,
                  sourceStockSkuId: localStockSubSkus.pack.id,
                }}
              />
              <span>
                <strong>{reward.cardName}</strong>
                <small>
                  <I18nText
                    en="Detail page · opening reveal · user bag · all pulls"
                    th="หน้ารายละเอียด · รีวีลตอนเปิด · ถุงการ์ดผู้ใช้ · ประวัติการเปิดทั้งหมด"
                  />
                </small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span><I18nText en="Audit rehearsal" th="ซ้อมตรวจสอบ" /></span>
            <h3><I18nText en="Stock event log" th="บันทึกเหตุการณ์สต็อก" /></h3>
          </div>
        </div>
        <ul className="local-production-event-log">
          {state.events.slice(0, 10).map((event, index) => (
            <li key={`${index}-${event.en}`}>{localized(event, language)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LocalStockSubSkuTest() {
  const language = useStoreLanguage();
  const [state, setState] = useState(localStockSubSkuInitialState);
  const [surface, setSurface] = useState<Surface>("customer");
  const [selectedQuantity, setSelectedQuantity] = useState(3);
  const [reveal, setReveal] = useState<{
    result: YnotGachaOpenResult;
    quantity: number;
  } | null>(null);
  const totals = useMemo(() => localStockSubSkuTotals(state), [state]);

  function openPacks(quantity: number) {
    const beforeHistoryCount = state.history.length;
    const next = openLocalStockPacks(state, quantity);
    const openedCount = Math.max(0, next.history.length - beforeHistoryCount);
    setState(next);
    if (openedCount > 0) {
      const rewards = next.history.slice(0, openedCount);
      const nextTotals = localStockSubSkuTotals(next);
      setReveal({
        result: buildRevealResult(rewards, nextTotals.availablePackEquivalent),
        quantity: rewards.length,
      });
    }
  }

  function receiveBoxes(quantity: number) {
    setState((current) => ({
      ...current,
      boxStock: current.boxStock + quantity,
      events: [
        copy(
          `Admin received ${quantity} box${quantity === 1 ? "" : "es"} into ${localStockSubSkus.box.sku}.`,
          `แอดมินรับเข้า ${quantity} กล่องไปยัง ${localStockSubSkus.box.sku}`,
        ),
        ...current.events,
      ],
    }));
  }

  function receiveLoosePacks(quantity: number) {
    setState((current) => ({
      ...current,
      loosePackStock: current.loosePackStock + quantity,
      events: [
        copy(
          `Admin received ${quantity} loose packs into ${localStockSubSkus.pack.sku}.`,
          `แอดมินรับเข้า ${quantity} ซองแยกไปยัง ${localStockSubSkus.pack.sku}`,
        ),
        ...current.events,
      ],
    }));
  }

  function openBoxes(quantity: number) {
    setState((current) => openLocalStockBoxes(current, quantity));
  }

  return (
    <section
      className="local-production-rehearsal"
      aria-label={localized(
        copy(
          "Production-like local stock Sub SKU rehearsal",
          "ซ้อม Sub SKU stock แบบใกล้โปรดักชันบน local",
        ),
        language,
      )}
    >
      <div className="local-production-switcher" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={surface === "customer"}
          className={surface === "customer" ? "is-active" : ""}
          onClick={() => setSurface("customer")}
        >
          <I18nText en="Customer production flow" th="ขั้นตอนลูกค้าแบบโปรดักชัน" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === "admin"}
          className={surface === "admin" ? "is-active" : ""}
          onClick={() => setSurface("admin")}
        >
          <I18nText en="Admin production flow" th="ขั้นตอนแอดมินแบบโปรดักชัน" />
        </button>
      </div>

      {surface === "customer" ? (
        <CustomerProductionFlow
          state={state}
          totals={totals}
          selectedQuantity={selectedQuantity}
          setSelectedQuantity={setSelectedQuantity}
          openPacks={openPacks}
        />
      ) : (
        <AdminProductionFlow
          state={state}
          totals={totals}
          language={language}
          receiveBoxes={receiveBoxes}
          receiveLoosePacks={receiveLoosePacks}
          openBoxes={openBoxes}
        />
      )}

      {reveal ? (
        <GachaRevealOverlay
          result={reveal.result}
          quantity={reveal.quantity}
          remainingSlots={totals.availablePackEquivalent}
          forceAnimation
          openAgainOptions={localCampaign.openOptions.map((quantity) => ({
            quantity,
            costCoins: quantity * localCampaign.costCoins,
            disabled: totals.availablePackEquivalent < quantity,
          }))}
          onOpenAgain={openPacks}
          onFinish={() => setReveal(null)}
          onClose={() => {
            setReveal(null);
            setSurface("customer");
          }}
        />
      ) : null}
    </section>
  );
}
