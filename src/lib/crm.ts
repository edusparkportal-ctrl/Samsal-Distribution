export const ENQUIRY_STATUSES = [
  { value: "new", label: "New", tone: "amber" },
  { value: "under_review", label: "Under review", tone: "teal" },
  { value: "sourcing", label: "Sourcing", tone: "teal" },
  { value: "quotation_prepared", label: "Quotation prepared", tone: "navy" },
  { value: "sent", label: "Quotation sent", tone: "navy" },
  { value: "accepted", label: "Accepted", tone: "green" },
  { value: "declined", label: "Declined", tone: "red" },
  { value: "completed", label: "Completed", tone: "green" },
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]["value"];
export const statusMeta = (v: string) => ENQUIRY_STATUSES.find((s) => s.value === v) ?? { value: v, label: v, tone: "grey" as const };
export const isEnquiryStatus = (v: string): v is EnquiryStatus => ENQUIRY_STATUSES.some((s) => s.value === v);
export const ENQUIRY_SOURCES = ["website", "phone", "email", "walk_in", "tender", "other"] as const;
export const CLOSED_STATUSES = ["accepted", "declined", "completed"];
/** Strip characters that have meaning in PostgREST filter syntax from a user search term. */
export const safeSearch = (s: string) => s.replace(/[^\p{L}\p{N}@._\- ]/gu, "").trim().slice(0, 60);
