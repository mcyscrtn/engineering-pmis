# Engineering PMIS — production deployment starter

This repository is a cloud-ready application foundation for an Engineering & Design Department project control system.

## Current implementation
- Supabase email/password authentication
- Responsive navy/white dashboard
- Project masterlist with live database subscription
- Project creation form, search, status and priority fields
- Dashboard KPI cards and project status distribution
- PostgreSQL schema for profiles, projects, team assignments, deliverables, activity history, documents and notifications
- Initial role model: `admin`, `engineer`, `viewer`
- Row Level Security policies and private project document bucket

## Deployment prerequisites
You need your own Supabase project and Vercel account. This source package does not create accounts, provision paid services, or publish a public URL automatically.

### 1. Create Supabase project
1. Create a project at https://supabase.com/dashboard.
2. Open SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. In Authentication settings, enable email/password and configure your allowed redirect URLs.
4. Add the first user through Authentication > Users.
5. Promote that user to admin using SQL (replace the email):
   ```sql
   update public.profiles p
   set role='admin', full_name='Engineering Manager'
   from auth.users u
   where p.id=u.id and u.email='admin@yourcompany.com';
   ```
   If the profile row is not created automatically, create it after the user signs up:
   ```sql
   insert into public.profiles(id,full_name,role)
   select id,'Engineering Manager','admin' from auth.users
   where email='admin@yourcompany.com'
   on conflict(id) do update set role='admin';
   ```
6. Copy Project URL and anon/publishable key from Project Settings > API.

### 2. Configure and run
```bash
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```
Open http://localhost:3000.

### 3. Deploy to Vercel
1. Push this folder to a private GitHub repository.
2. Import the repository into Vercel.
3. Add the two environment variables from `.env.local`.
4. Deploy and configure the production URL in Supabase Authentication redirect URLs.

## Roles and intended access
- `admin`: department-wide administration and project control.
- `engineer`: access to assigned projects and their deliverables/documents.
- `viewer`: read-only department-wide visibility.

New sign-ups default to `viewer`. An administrator should assign the correct role and project memberships. Do not expose a Supabase service-role key in browser code.

## Important production hardening before company-wide rollout
- Enforce invite-only user onboarding and administrator-managed role assignment.
- Review and test every RLS policy using separate admin, engineer, and viewer test accounts.
- Add server-side audit logging for profile/role changes and document operations.
- Add scheduled backups / point-in-time recovery according to the selected Supabase plan.
- Configure storage object policies to validate project membership from the project ID encoded in each storage path.
- Add file malware scanning, retention policy, and DWG MIME/extension validation.
- Implement remaining modules: deliverable CRUD and weighted progress roll-up, full project edit/archive, personnel workload, Gantt dependencies/milestones, PDF/XLSX reports, deadline notifications and admin screens.
- Conduct security, load, and disaster-recovery testing before production use.

## Data handling
Use company-approved accounts, retention rules, and access policies. Avoid uploading confidential drawings or client documents until the storage access policies and backup settings have been reviewed and approved by your IT/security administrator.
