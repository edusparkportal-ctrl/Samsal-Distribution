import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container-x max-w-2xl py-10 text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="text-4xl">Page not found</h1>
        <p className="mt-4 text-lg">The page you are looking for does not exist or has moved.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn-primary">Back to home</Link>
          <Link href="/products" className="btn-outline">Browse products</Link>
        </div>
      </div>
    </section>
  );
}
