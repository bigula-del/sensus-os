@AGENTS.md

# Sensus OS

Management platform for Sensus Travel DMC (premium MICE and leisure DMC, Lisbon; works across PT, ES, FR, IT, CV, BR, AR, CL, CO, MX).
The product owner is Matheus (admin). He does not code: explain decisions in plain language, never ask him technical questions,
and guide him click by click whenever an account or dashboard step is needed.

Spec: the "Sensus OS & Companion PWA — Product Specification" doc. Clickable prototype of all modules: the "Sensus OS" artifact.

## Stack
- Next.js 16 (App Router, `src/`), TypeScript, plain CSS in `src/app/globals.css` (brand tokens; no Tailwind).
  Next 16 renames middleware to `src/proxy.ts`. Read `node_modules/next/dist/docs/` before using an API you are unsure of.
  `cacheComponents` is deliberately OFF: every page depends on the signed-in user.
- Supabase (Postgres, Auth, Storage), EU region. Schema in `supabase/migrations/`.
- Hosting: Vercel (sensus-os.vercel.app). Supabase project URL and publishable key are in `src/lib/supabase/config.ts` (public by design);
  the only env var is `SUPABASE_SERVICE_ROLE_KEY` (secret, Vercel only). Pushing to `main` deploys automatically.

## Non-negotiable rules
1. **Internal costs never reach clients.** Net prices, actual costs, margins, expenses and supplier data live in
   separate internal tables (`proposal_line_costs`, `project_service_costs`, `supplier_rates`, `expenses`, `client_payments`).
   Client-facing pages (`/p/[token]`, future portal, Companion) read ONLY through `security definer` functions
   such as `client_proposal()` that return client-facing fields. Never add a cost field to those functions or tables.
   In staff UI, mark internal columns with the "Internal" label and `netcell` shading.
2. **Authorise on the server.** Every page and server action calls `requireStaff()` or `requireAdmin()` from `src/lib/auth.ts`.
   Row level security is the second wall, not the only one.
3. **HR is admin only** (`hr_*` tables, `/people`, `/settings/team`). Non-admins get a 404.
4. **Pro-formas and invoices have no fiscal value** and must say so. Official invoices stay in certified software.
5. Brand: yellow `#F3EA1F`, black, white; Familjen Grotesk (display) + Instrument Sans (body). Logos in `public/brand/`.
6. Supabase grants new tables to `anon` by default: every migration that creates a table must enable RLS and
   `revoke all on <table> from anon`.

## Quotation rules (from Matheus) for the proposal builder
- Per-person prices are for one person sharing a double room; single supplement shown separately.
- FOC: cost the full group including free places, then spread the free places' cost over the paying travellers.
- Standard meal allowance US$60 per person per meal at standard restaurants, with 1 alcoholic drink included.

## Testing the database
Local Postgres 16 is available. To test migrations and security rules:
```
psql -h <socket dir> -p <port> -U postgres -d <fresh db> -f supabase/tests/local_supabase_stub.sql \
  -f supabase/migrations/*.sql -f supabase/tests/rls_test.sql
```
Every migration change must keep `rls_test.sql` passing; add a test for every new rule.

## Build status
Done: schema + security rules, login, team accounts created by the admin with a temporary password (no SMTP yet), change password, role-based shell, Today, Pipeline (create, view, move), Suppliers (list, add),
People (admin, read-only), Team & access (invite, roles, block), public client proposal page,
Proposals (builder with internal net/margin columns, FOC, single supplement, locked FX, US$60 meal preset, versions, send + client link, staff preview).
Proposal maths lives in src/lib/proposals.ts; the server recalculates sell totals on save.
Next: projects created from approved proposals + expenses (AI receipt reading) + final margin, then calendar.
