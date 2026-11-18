import { ResourceView, type SP } from "@/components/admin/ResourceView";
import { RESOURCES } from "@/lib/admin/resources";

const def = RESOURCES.job_openings;
export const metadata = { title: def.label };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  return <ResourceView def={def} sp={await searchParams} />;
}
