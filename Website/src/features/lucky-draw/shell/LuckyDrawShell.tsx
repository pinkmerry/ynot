"use client";

import Link from "next/link";
import { Languages, Sparkles } from "lucide-react";
import { useLuckyDrawController } from "../state/useLuckyDrawController";
import { AdminView } from "../admin/AdminView";
import { CheckoutView } from "../customer/CheckoutView";
import { HomeView } from "../customer/HomeView";
import { OrdersView } from "../customer/OrdersView";
import { PickView } from "../customer/PickView";
import { ProfileView } from "../profile/ProfileView";
import { BottomNav } from "./BottomNav";
import { StatusPanel } from "./StatusPanel";

export function LuckyDrawShell() {
  const {
    lang,
    setLang,
    view,
    setView,
    lineVerified,
    isAdmin,
    adminRole,
    draw,
    orders,
    featuredCards,
    chaseCards,
    cardCatalog,
    quantity,
    setQuantity,
    slipName,
    slipPreviewUrl,
    lineName,
    setLineName,
    activeOrderId,
    selectedSlots,
    query,
    setQuery,
    syncError,
    profileInfo,
    profileLoaded,
    profileSaving,
    orderSubmitting,
    pickSubmitting,
    t,
    takenSlots,
    remaining,
    progress,
    filteredOrders,
    handleLineLogin,
    setPaymentSlip,
    createOrder,
    handlePickOrderChange,
    toggleSlot,
    confirmSlots,
    saveProfileInfo,
    saveDrawSettings,
    updateDrawLifecycle,
    updateOrderStatus,
    viewPaymentSlip,
    assignOrderSlots,
    uploadPaymentQr,
    uploadCardImage,
    updateFeaturedCardDraft,
    updateChaseCardDraft,
    saveCardSettings,
    openPickView,
  } = useLuckyDrawController();

  return (
    <main className="app-shell mobile-safe">
      <header className="glass sticky top-3 z-30 mb-4 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded-[22px] px-3 py-3">
        <button
          aria-label="Home"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
          onClick={() => setView("home")}
        >
          <Sparkles className="h-5 w-5 text-[var(--gold)]" />
        </button>
        <div className="min-w-0 px-1 text-center sm:px-3">
          <p className="truncate text-base font-black tracking-wide text-[var(--gold)]">{t.appName}</p>
          <p className="truncate text-[11px] text-[var(--muted)]">{t.tag}</p>
        </div>
        <div className="flex min-w-0 justify-end gap-2">
          {!lineVerified && (
            <Link
              href="/login"
              className="flex h-10 items-center rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/15 px-3 text-xs font-black text-[var(--gold)]"
            >
              Login
            </Link>
          )}
          <button
            className="flex h-10 max-w-[76px] items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 text-xs font-bold"
            onClick={() => setLang(lang === "th" ? "en" : "th")}
          >
            <Languages className="h-4 w-4 shrink-0 text-[var(--gold)]" />
            {lang.toUpperCase()}
          </button>
        </div>
      </header>

      <div className={view === "admin" ? "grid min-w-0 gap-4" : "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"}>
        <section className="min-w-0 space-y-4">
          {syncError && (
            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">
              {syncError}
            </div>
          )}
          {view === "home" && (
            <HomeView
              draw={draw}
              lang={lang}
              lineVerified={lineVerified}
              remaining={remaining}
              progress={progress}
              sold={takenSlots.size}
              featuredCards={featuredCards}
              chaseCards={chaseCards}
              onLogin={handleLineLogin}
              onCheckout={() => setView("checkout")}
              onPick={() => openPickView()}
            />
          )}
          {view === "checkout" && (
            <CheckoutView
              draw={draw}
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              quantity={quantity}
              slipName={slipName}
              slipPreviewUrl={slipPreviewUrl}
              isSubmitting={orderSubmitting}
              onLineName={setLineName}
              onQuantity={setQuantity}
              onSlip={setPaymentSlip}
              onSubmit={createOrder}
            />
          )}
          {view === "pick" && (
            <PickView
              draw={draw}
              lang={lang}
              orders={orders}
              activeOrderId={activeOrderId}
              selectedSlots={selectedSlots}
              takenSlots={takenSlots}
              isConfirming={pickSubmitting}
              onOrder={handlePickOrderChange}
              onSlot={toggleSlot}
              onConfirm={confirmSlots}
            />
          )}
          {view === "orders" && (
            <OrdersView
              lang={lang}
              orders={orders}
              query={query}
              filteredOrders={filteredOrders}
              onQuery={setQuery}
              onPick={(id) => {
                openPickView(id);
              }}
            />
          )}
          {view === "profile" && (
            <ProfileView
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              isAdmin={isAdmin}
              adminRole={adminRole}
              orders={orders}
              profileInfo={profileInfo}
              profileLoaded={profileLoaded}
              profileSaving={profileSaving}
              onLogin={handleLineLogin}
              onLanguage={() => setLang(lang === "th" ? "en" : "th")}
              onSaveProfile={saveProfileInfo}
            />
          )}
          {view === "admin" && isAdmin && (
            <AdminView
              draw={draw}
              lang={lang}
              orders={orders}
              onDraw={saveDrawSettings}
              onDrawLifecycle={updateDrawLifecycle}
              onApprove={(id) => void updateOrderStatus(id, "approved")}
              onReject={(id) => void updateOrderStatus(id, "rejected")}
              onViewSlip={(id) => void viewPaymentSlip(id)}
              onAssignSlots={assignOrderSlots}
              onQrUpload={uploadPaymentQr}
              onCardImageUpload={uploadCardImage}
              featuredCards={featuredCards}
              chaseCards={chaseCards}
              cardCatalog={cardCatalog}
              onFeaturedCards={updateFeaturedCardDraft}
              onChaseCards={updateChaseCardDraft}
              onSaveCards={saveCardSettings}
            />
          )}
          {view === "admin" && !isAdmin && (
            <ProfileView
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              isAdmin={isAdmin}
              adminRole={adminRole}
              orders={orders}
              profileInfo={profileInfo}
              profileLoaded={profileLoaded}
              profileSaving={profileSaving}
              onLogin={handleLineLogin}
              onLanguage={() => setLang(lang === "th" ? "en" : "th")}
              onSaveProfile={saveProfileInfo}
            />
          )}
        </section>

        <aside className={view === "admin" ? "hidden" : "hidden min-w-0 space-y-4 lg:block"}>
          <StatusPanel
            draw={draw}
            lang={lang}
            lineVerified={lineVerified}
            remaining={remaining}
            sold={takenSlots.size}
            orders={orders}
            onLogin={handleLineLogin}
            onProfile={() => setView("profile")}
            isAdmin={isAdmin}
            onAdmin={() => setView("admin")}
          />
        </aside>
      </div>

      <div className="bottom-nav-spacer" aria-hidden="true" />
      <BottomNav
        view={view}
        setView={(nextView) => {
          if (nextView === "pick") {
            openPickView();
            return;
          }
          setView(nextView);
        }}
        pending={orders.filter((o) => o.status === "pending").length}
        isAdmin={isAdmin}
      />
    </main>
  );
}
