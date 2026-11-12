import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { documents } from "@/config/documents";

export function DocumentsList() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {documents.map((d) => (
        <li key={d.title} className="card flex flex-col p-5">
          <FileText aria-hidden="true" className="mb-3 text-teal" size={28} strokeWidth={1.5} />
          <h3 className="text-base">{d.title}</h3>
          <p className="mt-1.5 flex-1 text-sm">{d.description}</p>
          {d.file ? (
            <a href={d.file} download className="btn-outline mt-4 w-full">
              <Download aria-hidden="true" size={16} /> Download
            </a>
          ) : (
            <Link href={`/contact?topic=${encodeURIComponent(d.title)}`} className="btn-outline mt-4 w-full">
              Request a copy
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
