"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import { AlertCircle, CheckCircle2, Loader2, Paperclip } from "lucide-react";
import {
  LIMITS,
  emptyValues,
  sanitiseValues,
  todayInNairobi,
  validate,
  validateFile,
  type FieldErrors,
  type FormKind,
  type FormValues,
} from "@/lib/validation";

type Status = "idle" | "submitting" | "success" | "error";

type FieldProps = {
  name: keyof FormValues | "attachment";
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
};

function Field({ name, label, error, required, hint, children }: FieldProps) {
  const uid = useId();
  const id = `${uid}-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required ? (
          <span className="text-red-700" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-grey-500"> (optional)</span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-grey-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
          <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function QuoteForm({
  kind = "quote",
  initialProduct = "",
  initialMessage = "",
  turnstileSiteKey = null,
}: {
  kind?: FormKind;
  initialProduct?: string;
  initialMessage?: string;
  turnstileSiteKey?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useRef<number>(0);
  const [values, setValues] = useState<FormValues>({
    ...emptyValues,
    product: initialProduct,
    message: initialMessage,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [minDate, setMinDate] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
    setMinDate(todayInNairobi());
  }, []);

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  function focusFirstError(errs: FieldErrors) {
    const first = Object.keys(errs).find((k) => errs[k as keyof FieldErrors]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${first === "file" ? "attachment" : first}"]`);
    el?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return; // prevents accidental repeated submissions

    const clean = sanitiseValues({ ...values });
    const errs = validate(kind, clean);
    const fileInput = formRef.current?.elements.namedItem("attachment") as HTMLInputElement | null;
    const file = fileInput?.files?.[0] ?? null;
    if (kind === "quote") {
      const fe = validateFile(file);
      if (fe) errs.file = fe;
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setStatus("error");
      setMessage("Please correct the highlighted fields and submit again.");
      focusFirstError(errs);
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const body = new FormData(formRef.current!);
      body.set("kind", kind);
      body.set("startedAt", String(startedAt.current));
      // send the sanitised values rather than raw DOM text
      (Object.keys(clean) as (keyof FormValues)[]).forEach((k) => body.set(k, clean[k]));
      if (kind !== "quote") body.delete("attachment");

      const res = await fetch("/api/quote", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        errors?: FieldErrors;
      };

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message ?? "Thank you. We have received your request.");
        return;
      }
      if (data.errors) {
        setErrors(data.errors);
        focusFirstError(data.errors);
      }
      setStatus("error");
      setMessage(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setStatus("error");
      setMessage("We could not reach the server. Check your connection and try again.");
    }
  }

  function reset() {
    setValues({ ...emptyValues, product: "" });
    setErrors({});
    setFileName("");
    setStatus("idle");
    setMessage("");
    startedAt.current = Date.now();
  }

  if (status === "success") {
    return (
      <div role="status" className="card border-teal/40 bg-teal-tint p-6 sm:p-8">
        <CheckCircle2 aria-hidden="true" className="mb-3 text-teal-dark" size={36} />
        <h2 className="text-xl font-bold">{kind === "quote" ? "Quotation request sent" : "Enquiry sent"}</h2>
        <p className="mt-2 text-charcoal">{message}</p>
        <button type="button" onClick={reset} className="btn-outline mt-6">
          {kind === "quote" ? "Submit another request" : "Send another enquiry"}
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";
  const quote = kind === "quote";

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby="form-status">
      {/* Honeypot - hidden from people, attractive to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div id="form-status" aria-live="polite">
        {status === "error" && message && (
          <div role="alert" className="flex gap-3 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
            <p>{message}</p>
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="organisation" label="Customer / organisation name" required={quote} error={errors.organisation}>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="organisation" type="text" autoComplete="organization" value={values.organisation}
              onChange={set("organisation")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required={quote} maxLength={LIMITS.short} />
          )}
        </Field>
        <Field name="contactName" label="Contact person" required error={errors.contactName}>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="contactName" type="text" autoComplete="name" value={values.contactName}
              onChange={set("contactName")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={LIMITS.short} />
          )}
        </Field>
        <Field name="email" label="Email address" required error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="email" type="email" inputMode="email" autoComplete="email" value={values.email}
              onChange={set("email")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={254} />
          )}
        </Field>
        <Field name="phone" label="Telephone number" required error={errors.phone} hint="e.g. 0712 345 678 or +254 712 345 678">
          {({ id, describedBy, invalid }) => (
            <input id={id} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone}
              onChange={set("phone")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={30} />
          )}
        </Field>
      </div>

      {quote ? (
        <>
          <Field name="product" label="Product or service required" required error={errors.product}>
            {({ id, describedBy, invalid }) => (
              <input id={id} name="product" type="text" value={values.product} onChange={set("product")}
                className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={LIMITS.short}
                placeholder="e.g. Floor cleaners, A4 printing paper" />
            )}
          </Field>
          <Field name="specifications" label="Product specifications" required error={errors.specifications}
            hint="Type, size, grade, packaging, brand preference or any standard it must meet.">
            {({ id, describedBy, invalid }) => (
              <textarea id={id} name="specifications" rows={4} value={values.specifications} onChange={set("specifications")}
                className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={LIMITS.long} />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="quantity" label="Quantity required" required error={errors.quantity} hint="Include units, e.g. 200 cartons or 50 reams.">
              {({ id, describedBy, invalid }) => (
                <input id={id} name="quantity" type="text" value={values.quantity} onChange={set("quantity")}
                  className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={LIMITS.short} />
              )}
            </Field>
            <Field name="deliveryLocation" label="Preferred delivery location" required error={errors.deliveryLocation}>
              {({ id, describedBy, invalid }) => (
                <input id={id} name="deliveryLocation" type="text" autoComplete="street-address" value={values.deliveryLocation}
                  onChange={set("deliveryLocation")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy}
                  required maxLength={LIMITS.short} placeholder="e.g. Westlands, Nairobi" />
              )}
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="deliveryDate" label="Required delivery date" required error={errors.deliveryDate}>
              {({ id, describedBy, invalid }) => (
                <input id={id} name="deliveryDate" type="date" min={minDate || undefined} value={values.deliveryDate}
                  onChange={set("deliveryDate")} className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required />
              )}
            </Field>
            <Field name="attachment" label="Attach a product list, BOQ or specification" error={errors.file}
              hint="PDF, Word, Excel, CSV, JPG or PNG. Maximum 4 MB.">
              {({ id, describedBy, invalid }) => (
                <label htmlFor={id} className={`field-input flex cursor-pointer items-center gap-2 ${invalid ? "border-red-600" : ""}`}>
                  <Paperclip aria-hidden="true" size={18} className="shrink-0 text-grey-500" />
                  <span className="truncate text-charcoal">{fileName || "Choose file"}</span>
                  <input id={id} name="attachment" type="file" className="sr-only" aria-invalid={invalid} aria-describedby={describedBy}
                    accept={LIMITS.allowedExtensions.map((x) => `.${x}`).join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setFileName(f?.name ?? "");
                      const err = validateFile(f);
                      setErrors((er) => ({ ...er, file: err ?? undefined }));
                    }} />
                </label>
              )}
            </Field>
          </div>
          <Field name="instructions" label="Additional instructions" error={errors.instructions}>
            {({ id, describedBy, invalid }) => (
              <textarea id={id} name="instructions" rows={3} value={values.instructions} onChange={set("instructions")}
                className="field-input" aria-invalid={invalid} aria-describedby={describedBy} maxLength={LIMITS.long} />
            )}
          </Field>
        </>
      ) : (
        <Field name="message" label="How can we help?" required error={errors.message}>
          {({ id, describedBy, invalid }) => (
            <textarea id={id} name="message" rows={6} value={values.message} onChange={set("message")}
              className="field-input" aria-invalid={invalid} aria-describedby={describedBy} required maxLength={LIMITS.long} />
          )}
        </Field>
      )}

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <button type="submit" disabled={submitting} className="btn-accent w-full px-8 py-3.5 text-base sm:w-auto">
          {submitting ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" size={18} /> Sending...
            </>
          ) : quote ? (
            "Submit quotation request"
          ) : (
            "Send enquiry"
          )}
        </button>
        <p className="text-xs text-grey-500">
          Fields marked * are required. We use your details only to respond to this request.
        </p>
      </div>
    </form>
  );
}
