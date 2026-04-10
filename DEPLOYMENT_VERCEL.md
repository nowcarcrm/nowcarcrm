# CRM Vercel Deployment Guide

## 1) Environment variables

Use the same values in local and Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, do not expose to client)

Local setup:

1. Copy `.env.example` to `.env.local`
2. Fill with real Supabase project values

Vercel setup:

1. Go to Project Settings -> Environment Variables
2. Add both variables for `Production`, `Preview`, and `Development` (as needed)
3. Redeploy after changes

Important:

- Do not commit `.env.local`
- If credentials were exposed by mistake, rotate keys in Supabase immediately

## 2) Vercel deployment baseline

This project is a standard Next.js app, so no special `vercel.json` is required.

Recommended:

- Framework Preset: Next.js (auto-detected)
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: default (leave empty)
- Node.js version: use Vercel default supported by Next.js 16

## 3) Pre-deploy checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Supabase SQL schema is fully applied (`supabase/schema.sql`)
- [ ] Required tables exist:
  - `users`, `leads`, `consultations`, `contracts`, `export_progress`
  - `lead_status_history`, `attendance`, `holidays`, `crm_activity_logs`
- [ ] `users.role` supports `admin`, `manager`, `staff`
- [ ] At least one active admin user exists in `users`
- [ ] `users.auth_user_id` is linked for real employee accounts
- [ ] RLS/policies are configured if production security policy requires them
- [ ] `.env.local` contains correct values locally
- [ ] Same env values are configured in Vercel

## 4) Post-deploy smoke test checklist

Use a production URL account matrix: `admin`, `manager`, `staff`.

Authentication:

- [ ] Login page loads
- [ ] Email/password login works
- [ ] Unauthenticated access to `/dashboard` redirects to `/login`
- [ ] Logout works and redirects to `/login`

CRM data:

- [ ] Lead creation succeeds and appears immediately in list
- [ ] Lead detail edit persists after refresh
- [ ] Counseling record create persists with method/importance/writer/time
- [ ] Contract + export fields persist after refresh
- [ ] Status history rows are created in `lead_status_history`

Permissions:

- [ ] `admin` sees all leads
- [ ] `staff` sees only own `manager_user_id` leads
- [ ] `staff` cannot edit/delete other staff leads
- [ ] Attendance page staff mode locks current user to self
- [ ] Admin/manager attendance view shows all employees

Attendance + CRM linkage:

- [ ] Check-in stores GPS and check-in status
- [ ] Check-out stores GPS and check-out status
- [ ] Weekend/holiday is auto-evaluated as off-day behavior
- [ ] Admin table shows activity count per employee/day
- [ ] CRM actions (lead create/status change/contract/consultation) increase activity totals

## 5) Recommended production monitoring

- Enable Vercel runtime logs and alerting
- Add Supabase error log review routine
- Track auth failures and repeated permission errors
- Keep a rollback note with previous successful deployment URL/commit
