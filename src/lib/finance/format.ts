export const money = (n: number | string | null | undefined, cur = "KES") =>
  `${cur} ${Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const day = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? v + "T00:00:00" : v).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "");
export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const num = (v: string) => { const n = Number(v.replace(/,/g, "").trim()); return Number.isFinite(n) ? n : NaN; };
