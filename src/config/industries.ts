/**
 * Industry copy. Describes typical supply needs only - it makes no claim of
 * past contracts, approvals or tenders. (Government wording is deliberately neutral.)
 */
export const industries: {
  slug: string;
  name: string;
  summary: string;
  needs: string[];
  categories: string[]; // category slugs
}[] = [
  {
    slug: "corporate-offices",
    name: "Corporate Offices",
    summary:
      "Offices need a steady flow of consumables, and a supplier who makes reordering simple.",
    needs: ["Printing paper and stationery", "Washroom hygiene supplies", "Daily cleaning products"],
    categories: ["stationery-office-supplies", "hygiene-supplies", "cleaning-supplies"],
  },
  {
    slug: "educational-institutions",
    name: "Educational Institutions",
    summary: "Schools and colleges buy in volume and on a term-by-term rhythm.",
    needs: ["Exercise books and notebooks", "Pens, pencils and paper", "Cleaning and hygiene supplies for facilities"],
    categories: ["stationery-office-supplies", "cleaning-supplies", "hygiene-supplies"],
  },
  {
    slug: "hospitality-businesses",
    name: "Hospitality Businesses",
    summary: "Hotels, restaurants and guest facilities depend on consistent cleanliness and hygiene.",
    needs: ["Dishwashing and kitchen cleaning", "Tissue and washroom products", "Bin liners and floor cleaners"],
    categories: ["cleaning-supplies", "hygiene-supplies"],
  },
  {
    slug: "property-management",
    name: "Property Management Companies",
    summary: "Managed properties need dependable supply for common areas across multiple sites.",
    needs: ["Common-area cleaning products", "Washroom dispensers and refills", "Bin liners and protective gloves"],
    categories: ["cleaning-supplies", "hygiene-supplies", "general-institutional-supplies"],
  },
  {
    slug: "ngos-development-organisations",
    name: "NGOs and Development Organisations",
    summary: "Programmes often need items sourced to a defined specification, with clear quotations.",
    needs: ["Items sourced to a bill of quantities", "Office and programme stationery", "Hygiene and cleaning consumables"],
    categories: ["general-institutional-supplies", "stationery-office-supplies", "hygiene-supplies"],
  },
  {
    slug: "government-public-institutions",
    name: "Government and Public Institutions",
    summary:
      "Public institutions need clear, itemised quotations for routine consumables and operational supplies.",
    needs: ["Itemised quotations against a stated list", "Stationery and office consumables", "Cleaning and hygiene supplies"],
    categories: ["stationery-office-supplies", "cleaning-supplies", "general-institutional-supplies"],
  },
];
