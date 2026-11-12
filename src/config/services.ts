/**
 * Services copy. Only generic procurement/supply capabilities are described.
 * CONFIRM before publishing anything that implies owned fleet, warehouse,
 * licences, credit terms or delivery coverage beyond Nairobi.
 */
export type ServiceIcon = "search" | "boxes" | "building" | "truck" | "clipboard" | "map";

export const services: {
  slug: string;
  title: string;
  icon: ServiceIcon;
  summary: string;
  detail: string;
}[] = [
  {
    slug: "procurement-sourcing",
    title: "Procurement and Sourcing",
    icon: "search",
    summary: "We source the products you need and return a clear quotation.",
    detail:
      "Share a list, a specification or a bill of quantities. We source against your requirements and respond with a quotation, so your team spends less time chasing suppliers.",
  },
  {
    slug: "wholesale-supply",
    title: "Wholesale Supply",
    icon: "boxes",
    summary: "Bulk supply of cleaning, hygiene and stationery products.",
    detail:
      "Supply in quantities suited to businesses, with quotations based on what you need and current availability.",
  },
  {
    slug: "institutional-supply",
    title: "Institutional Supply",
    icon: "building",
    summary: "Supply tailored to the needs of schools, offices, NGOs and facilities.",
    detail:
      "Organised, documented supply for organisations that buy regularly and need dependable, clearly quoted orders.",
  },
  {
    slug: "commercial-distribution",
    title: "Commercial Distribution",
    icon: "truck",
    summary: "Distribution of goods to commercial customers around Nairobi.",
    detail:
      "Coordinated distribution of supplied goods to business premises, starting in Nairobi and surrounding areas.",
  },
  {
    slug: "order-fulfilment",
    title: "Order Fulfilment",
    icon: "clipboard",
    summary: "Orders confirmed, checked against your specification and prepared for dispatch.",
    detail:
      "Once a quotation is accepted we confirm the order, check products against the agreed specification and prepare it for delivery.",
  },
  {
    slug: "delivery-coordination",
    title: "Delivery Coordination",
    icon: "map",
    summary: "Delivery arranged to your location and required date.",
    detail:
      "We coordinate delivery to your preferred location and keep you informed on timing, subject to the agreed order terms.",
  },
];

export const processSteps = [
  { title: "Customer requirement", text: "You tell us what you need, in what quantity and by when." },
  { title: "Product sourcing", text: "We source products that match your specification." },
  { title: "Quotation", text: "You receive a clear quotation for review." },
  { title: "Order confirmation", text: "You confirm and we lock in the order details." },
  { title: "Supply and delivery", text: "Goods are supplied and delivered to your location." },
];
