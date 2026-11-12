/**
 * Downloadable documents area.
 * Set `file` to a path inside /public/documents (e.g. "/documents/samsal-company-profile.pdf")
 * ONLY after the owner has approved publishing that document.
 * Statutory certificates and private company documents should NOT be added here
 * without explicit approval; they are offered "on request" instead.
 */
export const documents: {
  title: string;
  description: string;
  file: string | null;
}[] = [
  { title: "Company profile", description: "An overview of SAMSAL and how we work.", file: null },
  { title: "Product catalogue", description: "Our product categories and what we can source.", file: null },
  {
    title: "Supplier documentation",
    description: "Supplier registration information, shared with qualifying customers on request.",
    file: null,
  },
];
