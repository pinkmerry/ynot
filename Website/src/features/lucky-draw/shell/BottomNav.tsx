"use client";

import type React from "react";
import { ClipboardList, CreditCard, Home, Settings, Ticket, UserRound } from "lucide-react";
import type { View } from "../model";

export function BottomNav({ view, setView, pending, isAdmin }: { view: View; setView: (view: View) => void; pending: number; isAdmin: boolean }) {
  const items: Array<{ view: View; icon: React.ReactNode; label: string; badge?: number }> = [
    { view: "home", icon: <Home className="h-5 w-5" />, label: "Home" },
    { view: "checkout", icon: <CreditCard className="h-5 w-5" />, label: "Pay" },
    { view: "pick", icon: <Ticket className="h-5 w-5" />, label: "Pick" },
    { view: "orders", icon: <ClipboardList className="h-5 w-5" />, label: "Orders" },
    { view: "profile", icon: <UserRound className="h-5 w-5" />, label: "Profile" },
    ...(isAdmin ? [{ view: "admin" as const, icon: <Settings className="h-5 w-5" />, label: "Admin", badge: pending }] : []),
  ];
  return (
    <nav
      className="bottom-nav-shell fixed left-1/2 z-40 grid w-[calc(100%-24px)] max-w-[640px] -translate-x-1/2 rounded-[24px] border border-white/10 bg-[#10111f]/95 p-2 shadow-2xl backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <button
          key={item.view}
          className={[
            "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition",
            view === item.view ? "bg-[var(--gold)] text-slate-950" : "text-[var(--muted)] hover:bg-white/[0.05] hover:text-white",
          ].join(" ")}
          onClick={() => setView(item.view)}
        >
          {item.icon}
          {item.label}
          {!!item.badge && (
            <span className="absolute right-2 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] text-white">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
