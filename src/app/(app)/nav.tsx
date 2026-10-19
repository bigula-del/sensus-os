"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

type Item = { href: string; label: string; soon?: boolean; adminOnly?: boolean };
const GROUPS: { label?: string; items: Item[] }[] = [
  { items: [{ href: "/", label: "Today" }] },
  { label: "Sell", items: [{ href: "/pipeline", label: "Pipeline" }, { href: "/proposals", label: "Proposals", soon: true }, { href: "/projects", label: "Projects", soon: true }] },
  { label: "Daily work", items: [{ href: "/calendar", label: "Calendar", soon: true }, { href: "/inbox", label: "Inbox", soon: true }, { href: "/chat", label: "Team chat", soon: true }, { href: "/notes", label: "Notes", soon: true }] },
  { label: "Money", items: [{ href: "/expenses", label: "Expenses", soon: true }] },
  { label: "Clients", items: [{ href: "/forms", label: "Forms", soon: true }, { href: "/sign", label: "E-signature", soon: true }] },
  { label: "Growth", items: [{ href: "/marketing", label: "Marketing", soon: true }] },
  { label: "Setup", items: [{ href: "/suppliers", label: "Suppliers" }, { href: "/people", label: "People", adminOnly: true }, { href: "/settings/team", label: "Team & access", adminOnly: true }] },
];

export function Nav({ role }: { role: Role }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="Main">
      {GROUPS.map((g, i) => {
        const items = g.items.filter((it) => !it.adminOnly || role === "admin");
        if (!items.length) return null;
        return (
          <div key={i} style={{ display: "contents" }}>
            {g.label && <div className="navlabel">{g.label}</div>}
            {items.map((it) =>
              it.soon ? (
                <span key={it.href} className="soon" aria-disabled="true" style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", fontSize: 13.5, color: "#D9D8CF", fontWeight: 500 }}>
                  {it.label}
                  <span className="lock">Soon</span>
                </span>
              ) : (
                <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}>
                  {it.label}
                  {it.adminOnly && <span className="lock">Admin</span>}
                </Link>
              ),
            )}
          </div>
        );
      })}
    </nav>
  );
}
