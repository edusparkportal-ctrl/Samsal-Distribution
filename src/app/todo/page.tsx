import { TodoApp } from "@/components/TodoApp";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "To-do List",
  description: "A simple browser-based task list. Add, complete, filter and remove tasks; your list stays saved locally on this device.",
  path: "/todo",
});

export default function TodoPage() {
  return (
    <>
      <section className="on-dark bg-navy bg-grid text-white">
        <div className="container-x py-12 sm:py-16">
          <p className="eyebrow">Personal productivity</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">A little more focus, one task at a time.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/80">A lightweight to-do list that remembers your tasks on this device.</p>
        </div>
        <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-amber via-amber to-teal" />
      </section>
      <section className="section bg-slate-50">
        <div className="container-x">
          <TodoApp />
        </div>
      </section>
    </>
  );
}
