import type { ReactNode } from "react";
import { BRAND } from "@/lib/trade";

/** Black / metallic blue / gold band used by the Trade documents module. */
export function TradeHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 overflow-hidden rounded-lg" style={{ background: `linear-gradient(110deg, ${BRAND.black} 0%, #16202c 55%, ${BRAND.blue} 100%)`, borderBottom: `3px solid ${BRAND.gold}` }}>
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: BRAND.gold }}>SAMSAL Trade documents</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-white/70">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export const goldBtn = "inline-flex items-center rounded px-3.5 py-2 text-sm font-semibold text-black hover:brightness-110";
export const goldStyle = { background: BRAND.gold } as const;
export const blueBtn = "inline-flex items-center rounded px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110";
export const blueStyle = { background: BRAND.blue } as const;
