# Setting up Sensus OS

## 1. Supabase (database and logins)
1. Sign up at supabase.com with **Continue with GitHub** (the Sensus GitHub account).
2. New project: name `sensus-os`, region **West EU (Ireland)** or **Central EU (Frankfurt)**, a strong database password saved in a password manager.
3. Apply the database: SQL Editor → paste `supabase/migrations/20261019000001_foundation.sql` → Run.
4. Authentication → Sign In / Providers: keep Email on; turn **off** "Allow new users to sign up" (people join by invitation only).
5. Authentication → URL Configuration: Site URL = the Vercel address (later `https://os.sensustravel.com`); add it to Redirect URLs as `https://…/auth/confirm`.
6. Create the first user (Matheus): Authentication → Users → Add user → **Create new user**, with email, password and
   "Auto Confirm User" ticked. The first account becomes Admin automatically.
7. Team members are added from Sensus OS → Team & access, which creates the account and shows a temporary password.
   (Email templates can only be edited after connecting a custom SMTP server, e.g. Microsoft 365; then set the invite and
   recovery links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<invite|recovery>&next=/set-password`.)

## 2. Vercel (hosting)
1. Sign up at vercel.com with **Continue with GitHub**.
2. Add New → Project → import `sensus-os`.
3. Environment variables (from Supabase → Project Settings → API): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy. Every change saved to GitHub then goes live automatically.

## 3. Own address (optional, later)
Vercel → Project → Domains → add `os.sensustravel.com`, then add the DNS record Vercel shows in Wix (Domains → DNS records).
