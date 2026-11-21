"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { flash, dbError, isUuid, str, optStr } from "@/lib/admin/forms";
import { parseQty } from "@/lib/portal/format";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Customer actions. Each one first requires an approved, active customer, then calls ONE database function that
 * recomputes prices, minimums, stock and ownership itself. The browser only ever says "product X, quantity N".
 */
const back = (fd: FormData, fallback: string) => {
  const v = String(fd.get("back") ?? "");
  return v === "/portal" || v.startsWith("/portal/") ? v.slice(0, 300) : fallback;
};

export async function addToCart(fd: FormData) {
  await requireCustomer();
  const to = back(fd, "/portal/catalogue");
  const product = String(fd.get("product_id") ?? "");
  const qty = parseQty(fd.get("quantity"));
  if (!isUuid(product) || qty === null || qty <= 0) flash(to, "error", "Enter a quantity.");
  const supabase = await createSupabaseServerClient();
  // Adding the same product again adds to the quantity already in the cart.
  const { data: cart } = await supabase.rpc("portal_cart");
  const existing = ((cart as { product_id: string; quantity: number }[] | null) ?? []).find((r) => r.product_id === product);
  const { error } = await supabase.rpc("portal_cart_set", { p_product: product, p_quantity: (existing ? Number(existing.quantity) : 0) + qty });
  if (error) flash(to, "error", dbError(error));
  revalidatePath("/portal", "layout");
  flash(to, "ok", "Added to your cart.");
}

export async function setCartQuantity(fd: FormData) {
  await requireCustomer();
  const product = String(fd.get("product_id") ?? "");
  const qty = fd.get("remove") ? 0 : parseQty(fd.get("quantity"));
  if (!isUuid(product) || qty === null) flash("/portal/cart", "error", "Enter a valid quantity.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_cart_set", { p_product: product, p_quantity: qty });
  if (error) flash("/portal/cart", "error", dbError(error));
  revalidatePath("/portal", "layout");
  flash("/portal/cart", "ok", qty === 0 ? "Removed from your cart." : "Cart updated.");
}

export async function clearCart() {
  await requireCustomer();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_cart_clear");
  if (error) flash("/portal/cart", "error", dbError(error));
  revalidatePath("/portal", "layout");
  flash("/portal/cart", "ok", "Your cart is empty.");
}

export async function checkout(fd: FormData) {
  const ctx = await requireCustomer();
  const rl = await rateLimit(`pcheckout:${ctx.userId}`, 10, 10 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) flash("/portal/checkout", "error", "Too many attempts. Please wait a few minutes and try again.");
  const key = String(fd.get("idempotency_key") ?? "");
  const requested = str(fd, "requested_date", 10);
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) flash("/portal/checkout", "error", "Choose a valid delivery date.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_checkout", {
    p_address: str(fd, "address", 500),
    p_reference: optStr(fd, "reference", 60),
    p_notes: optStr(fd, "notes", 1000),
    p_requested: requested || null,
    p_key: isUuid(key) ? key : null,
  });
  if (error || typeof data !== "string") flash("/portal/checkout", "error", dbError(error));
  revalidatePath("/portal", "layout");
  flash(`/portal/orders/${data}`, "ok", "Thank you. Your order has been received and our team will confirm it shortly.");
}

export async function repeatOrder(fd: FormData) {
  await requireCustomer();
  const id = String(fd.get("order_id") ?? "");
  if (!isUuid(id)) flash("/portal/orders", "error", "Order not found.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_repeat_order", { p_order: id });
  if (error) flash(`/portal/orders/${id}`, "error", dbError(error));
  revalidatePath("/portal", "layout");
  const skipped = Number(data ?? 0);
  flash("/portal/cart", "ok", skipped > 0 ? `Items copied to your cart at today's prices. ${skipped} item${skipped === 1 ? " is" : "s are"} no longer available to order online.` : "Items copied to your cart at today's prices. Check the quantities, then check out.");
}

export async function cancelOrder(fd: FormData) {
  await requireCustomer();
  const id = String(fd.get("order_id") ?? "");
  if (!isUuid(id)) flash("/portal/orders", "error", "Order not found.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_cancel_order", { p_order: id, p_reason: optStr(fd, "reason", 300) });
  if (error) flash(`/portal/orders/${id}`, "error", dbError(error));
  revalidatePath("/portal", "layout");
  flash(`/portal/orders/${id}`, "ok", "Your order has been cancelled.");
}
