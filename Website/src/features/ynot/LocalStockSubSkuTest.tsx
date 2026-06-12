"use client";

import { useMemo, useState } from "react";
import { GachaRevealOverlay } from "./GachaRevealOverlay";
import { CoinPip, formatCoins } from "./cr/Icons";
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
import type { YnotGachaOpenItem, YnotGachaOpenResult } from "./types";

type Surface = "customer" | "admin";

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
          {reward.cardCode} · {reward.tier} · pull #{reward.pullNumber}
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
        <span className="cr-eyebrow">Price / pack</span>
        <strong>
          <CoinPip size={18} /> {formatCoins(localCampaign.costCoins)}
        </strong>
        <small className="cr-mute">coins per open</small>
      </div>
      <div className="stat">
        <span className="cr-eyebrow">Stock left</span>
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
        <span className="cr-eyebrow">Box stock</span>
        <strong className="cr-tnum">{formatCount(totals.availableBoxes)}</strong>
        <small className="cr-mute">
          {formatCount(totals.boxPackEquivalent)} packs inside boxes
        </small>
      </div>
      <div className="stat">
        <span className="cr-eyebrow">This open</span>
        <strong>
          <CoinPip size={18} /> {formatCoins(totalCost)}
        </strong>
        <small className="cr-mute">x{selectedQuantity} selected</small>
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
          <span className="cr-pack-art-sticker">Local</span>
          {!soldOut ? (
            <span className="cr-hero-stock">
              {formatCount(totals.availablePackEquivalent)}/
              {formatCount(localCampaign.totalSlots)}
            </span>
          ) : null}
          <span className="cr-hero-eyebrow">POKEMON</span>
          <span className="cr-hero-footer">OP16 LOCAL STOCK TEST</span>
        </div>
      </div>

      <div className="cr-detail-info-card">
        <div className="cr-detail-tag-row">
          <span className="cr-pill cr-pill-ink">Pokemon</span>
          <span className="cr-pill">Box to pack</span>
          <span className="cr-pill cr-pill-mint">Mock wallet</span>
          <span className="cr-pill cr-pill-blue">Local only</span>
        </div>

        <p className="cr-detail-desc">
          Customer view rehearsal for buying packs from mixed stock. Box stock
          stays visible, loose packs decrement first, and a sealed box opens
          into child packs when loose stock is short.
        </p>

        <CustomerStatGrid totals={totals} selectedQuantity={selectedQuantity} />
      </div>

      <div className="cr-stack" style={{ gap: 18 }}>
        <section className="cr-section">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow">Prize lineup</span>
              <h3>What customers see before opening</h3>
            </div>
            <small className="cr-mute">
              {localStockRewardPool.length} mock rewards
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
              <span className="cr-eyebrow">Customer bag</span>
              <h3>Collection and all-pulls preview</h3>
            </div>
            <small className="cr-mute">
              {formatCount(state.bag.length)} owned reward
              {state.bag.length === 1 ? "" : "s"}
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
              No collection rows yet. Open x3 packs to see reward images in the
              same style as customer bag and all-pulls history.
            </p>
          )}
        </section>
      </div>

      {!soldOut ? (
        <div className="cr-dock" role="region" aria-label="Open this pack">
          <div className="cr-dock-pack">
            <div className="cr-pack-art pokemon local-production-dock-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={localStockSubSkus.pack.imageUrl} alt="" />
            </div>
            <div className="cr-stack" style={{ gap: 2, minWidth: 0 }}>
              <small className="cr-eyebrow" style={{ fontSize: 9.5 }}>
                Open this pack
              </small>
              <strong className="local-production-dock-title">
                {localCampaign.title}
              </strong>
              <small className="cr-mute local-production-dock-subtitle">
                <CoinPip size={10} /> {formatCoins(localCampaign.costCoins)} /
                pack · {formatCount(totals.availablePackEquivalent)} left
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
              <small>Total</small>
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
              Open {selectedQuantity} pack
              {selectedQuantity === 1 ? "" : "s"}
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
  kind: string;
  available: number;
  packEquivalent: number;
  detail: string;
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
  receiveBoxes,
  receiveLoosePacks,
  openBoxes,
}: {
  state: LocalStockSubSkuState;
  totals: LocalStockTotals;
  receiveBoxes: (quantity: number) => void;
  receiveLoosePacks: (quantity: number) => void;
  openBoxes: (quantity: number) => void;
}) {
  return (
    <div className="local-production-admin">
      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span>Admin stock control</span>
            <h3>Main SKU and Sub SKU inventory</h3>
          </div>
          <strong>{formatCount(totals.availablePackEquivalent)} packs sellable</strong>
        </div>

        <div className="local-production-admin-actions">
          <button type="button" onClick={() => receiveBoxes(1)}>
            Receive 1 box
          </button>
          <button type="button" onClick={() => receiveLoosePacks(12)}>
            Receive 12 loose packs
          </button>
          <button
            type="button"
            onClick={() => openBoxes(1)}
            disabled={state.boxStock <= 0}
          >
            Convert 1 box to packs
          </button>
        </div>

        <div className="local-production-admin-stock-table">
          <div className="local-production-admin-stock-head">
            <span>Sub SKU</span>
            <span>Kind</span>
            <span>Units</span>
            <span>Packs</span>
            <span>Rule</span>
          </div>
          <AdminStockRow
            imageUrl={localStockSubSkus.box.imageUrl}
            label={localStockSubSkus.box.label}
            sku={localStockSubSkus.box.sku}
            kind="box"
            available={state.boxStock}
            packEquivalent={totals.boxPackEquivalent}
            detail={`1 box = ${localStockSubSkus.box.childQuantity} packs`}
          />
          <AdminStockRow
            imageUrl={localStockSubSkus.pack.imageUrl}
            label={localStockSubSkus.pack.label}
            sku={localStockSubSkus.pack.sku}
            kind="pack"
            available={state.loosePackStock}
            packEquivalent={state.loosePackStock}
            detail="Child stock sold to customer opens"
          />
        </div>
      </section>

      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span>Prize catalog usage</span>
            <h3>Images and reward destinations</h3>
          </div>
          <strong>{formatCount(state.history.length)} pull rows</strong>
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
                  Detail page · opening reveal · user bag · all pulls
                </small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel soft-card">
        <div className="admin-panel-head">
          <div>
            <span>Audit rehearsal</span>
            <h3>Stock event log</h3>
          </div>
        </div>
        <ul className="local-production-event-log">
          {state.events.slice(0, 10).map((event, index) => (
            <li key={`${index}-${event}`}>{event}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LocalStockSubSkuTest() {
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
        `Admin received ${quantity} box${quantity === 1 ? "" : "es"} into ${localStockSubSkus.box.sku}.`,
        ...current.events,
      ],
    }));
  }

  function receiveLoosePacks(quantity: number) {
    setState((current) => ({
      ...current,
      loosePackStock: current.loosePackStock + quantity,
      events: [
        `Admin received ${quantity} loose packs into ${localStockSubSkus.pack.sku}.`,
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
      aria-label="Production-like local stock Sub SKU rehearsal"
    >
      <div className="local-production-switcher" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={surface === "customer"}
          className={surface === "customer" ? "is-active" : ""}
          onClick={() => setSurface("customer")}
        >
          Customer production flow
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === "admin"}
          className={surface === "admin" ? "is-active" : ""}
          onClick={() => setSurface("admin")}
        >
          Admin production flow
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
