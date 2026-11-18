"use client";
export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-outline px-3 py-2 text-sm print:hidden">{label}</button>;
}
