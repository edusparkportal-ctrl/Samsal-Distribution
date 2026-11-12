"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Circle, ListTodo, Plus, Trash2 } from "lucide-react";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

type Filter = "all" | "active" | "completed";
const STORAGE_KEY = "samsal-todo-items-v1";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [ready, setReady] = useState(false);

  // Load after mount so server-rendered markup remains consistent with the browser.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is Todo =>
              item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.text === "string" &&
              typeof item.completed === "boolean" &&
              typeof item.createdAt === "number",
          );
          setTodos(valid);
        }
      }
    } catch {
      // If local storage is unavailable or malformed, keep the app usable in memory.
      setTodos([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch {
      // Storage may be disabled or full; changes still work for this page session.
    }
  }, [ready, todos]);

  const visibleTodos = useMemo(
    () => todos.filter((todo) => filter === "all" || (filter === "active" ? !todo.completed : todo.completed)),
    [filter, todos],
  );
  const remaining = todos.filter((todo) => !todo.completed).length;

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setTodos((current) => [{ id: makeId(), text, completed: false, createdAt: Date.now() }, ...current]);
    setInput("");
  }

  function toggleTodo(id: string) {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)));
  }

  function deleteTodo(id: string) {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }

  function clearCompleted() {
    setTodos((current) => current.filter((todo) => !todo.completed));
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(20,45,78,0.12)]">
        <div className="bg-navy px-6 py-7 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber text-navy">
              <ListTodo aria-hidden="true" size={23} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-light">Simple productivity</p>
              <h2 className="mt-1 text-2xl font-bold text-white">Your task list</h2>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">
            Add tasks, mark them complete, and come back later. Your list is saved in this browser on this device.
          </p>
        </div>

        <div className="p-5 sm:p-8">
          <form onSubmit={addTodo} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="new-todo" className="sr-only">New task</label>
            <input
              id="new-todo"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={200}
              placeholder="What would you like to get done?"
              className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal focus:ring-4 focus:ring-teal/10"
            />
            <button type="submit" disabled={!input.trim()} className="btn-accent min-h-12 rounded-xl px-5 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus aria-hidden="true" size={18} /> Add task
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Filter tasks">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${filter === item.value ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-navy"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 text-sm text-slate-500 sm:justify-end">
              <span aria-live="polite">{remaining} {remaining === 1 ? "task" : "tasks"} left</span>
              <button
                type="button"
                onClick={clearCompleted}
                disabled={!todos.some((todo) => todo.completed)}
                className="font-semibold text-teal-dark hover:text-navy disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Clear completed
              </button>
            </div>
          </div>

          <ul className="mt-2 divide-y divide-slate-100" aria-label="Tasks">
            {!ready ? (
              <li className="py-10 text-center text-sm text-slate-500">Loading your tasks…</li>
            ) : visibleTodos.length ? (
              visibleTodos.map((todo) => (
                <li key={todo.id} className="group flex items-center gap-3 py-4">
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    aria-label={todo.completed ? `Mark ${todo.text} as active` : `Mark ${todo.text} as completed`}
                    aria-pressed={todo.completed}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${todo.completed ? "border-teal bg-teal text-white" : "border-slate-300 text-transparent hover:border-teal"}`}
                  >
                    {todo.completed ? <Check aria-hidden="true" size={15} strokeWidth={3} /> : <Circle aria-hidden="true" size={13} />}
                  </button>
                  <span className={`min-w-0 flex-1 break-words text-base ${todo.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {todo.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`Delete ${todo.text}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </li>
              ))
            ) : (
              <li className="py-12 text-center">
                <p className="text-base font-semibold text-navy">
                  {filter === "completed" ? "No completed tasks yet" : filter === "active" ? "You’re all caught up" : "Your list is clear"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {filter === "all" ? "Add a task above to get started." : "Try another filter or add a new task."}
                </p>
              </li>
            )}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Tasks are stored only in your browser’s local storage and are not sent to SAMSAL or synchronized to other devices.
          </p>
        </div>
      </div>
    </section>
  );
}
