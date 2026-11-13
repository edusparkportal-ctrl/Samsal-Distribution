import { redirect } from "next/navigation";

/** Read a trimmed string field, capped at `max` characters. Empty string when missing. */
export function str(fd: FormData, name: string, max = 500): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
/** Optional text: empty becomes null (so the database stores NULL, not ""). */
export function optStr(fd: FormData, name: string, max = 500): string | null {
  const v = str(fd, name, max);
  return v === "" ? null : v;
}
export const bool = (fd: FormData, name: string) => fd.get(name) === "on" || fd.get(name) === "true";
export function int(fd: FormData, name: string, fallback = 0): number {
  const n = Number.parseInt(String(fd.get(name) ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Redirect back to a page carrying a one-line result message (shown by <Flash/>). */
export function flash(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

/** Map a Postgres/PostgREST error to a message that is safe and useful to show to staff. */
export function dbError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Unknown error.";
  if (err.code === "42501") return "The database refused that action: you do not have permission.";
  if (err.code === "23505") return "That value already exists. Choose a different one.";
  if (err.code === "23503") return "That record is still in use by other records.";
  if (err.code === "23514") return "One of the values is not allowed (check lengths, formats and links).";
  if (err.code === "P0001") return err.message || "That change is not allowed."; // our own trigger messages are written for staff
  return "The change could not be saved. Please check the values and try again.";
}
