import { notFound } from "next/navigation";
import { ResourceView, type SP } from "@/components/admin/ResourceView";
import { RESOURCE_BY_ROUTE } from "@/lib/admin/resources";

export async function generateMetadata({ params }: { params: Promise<{ resource: string }> }) {
  const def = RESOURCE_BY_ROUTE[(await params).resource];
  return { title: def?.label ?? "Website" };
}

export default async function WebsiteResourcePage({ params, searchParams }: { params: Promise<{ resource: string }>; searchParams: Promise<SP> }) {
  const def = RESOURCE_BY_ROUTE[(await params).resource];
  if (!def) notFound();
  return <ResourceView def={def} sp={await searchParams} />;
}
