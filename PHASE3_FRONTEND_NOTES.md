# Phase 3 Frontend Update

This source update extends the existing Engineering PMIS without replacing the dashboard,
authentication flow, or Deliverables module.

## Added frontend sections

- **Activity** — reads `project_activity`, displays project/deliverable events, user attribution,
  timestamps, status/progress changes, remarks, and JSON change details.
- **Revisions** — creates formal revisions through `create_deliverable_revision()` and displays
  revision numbers, reasons, creator, timestamp, and saved deliverable snapshots.
- **Project Members** — allows administrators to assign Engineers and Management Viewers to
  individual projects. The form filters employees by their account role.

## Database status

The Phase 3 activity/revision migration was already executed manually in Supabase in the
current project. The copy in `supabase/manual-migrations/phase-3-activity-revision.sql` is
kept for source history and documentation. **Do not run it again on the already-migrated
database.**

The separate `phase-3-realtime-publication.sql` adds `project_activity`, `deliverable_revisions`,
and `project_members` to the `supabase_realtime` publication only if they are not already
published. Run this one-time SQL in Supabase if those tables are not already enabled for
Realtime.

## Deploy

1. Replace the contents of your GitHub repository with this package's source files, or copy
   the changed files into the matching paths.
2. Commit and push to the production branch (`main`).
3. Wait for Vercel to finish the Production deployment.
4. Confirm the Vercel environment variables `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` remain configured. Never put a service-role key in the
   browser environment.
5. Test with separate Admin, Engineer, and Viewer accounts.

## Important testing notes

- Formal revisions start at `Rev. 00` for each deliverable.
- The revision RPC checks that the caller is an Admin or an Engineer assigned to the project.
- Management Viewers are read-only and require a `project_members` row with
  `assignment_type = 'Viewer'`.
- Engineers should have `assignment_type = 'Engineer'`.
- The app reads activity and revision rows using Supabase RLS; frontend visibility is not a
  substitute for database authorization.
- The Activity and Revision screens use Realtime subscriptions. The relevant tables must be
  members of the `supabase_realtime` publication.

## Validation limitation

The source was statically checked for JSX/TypeScript syntax. A full Next.js production build
could not be completed in this environment because dependency installation timed out. Run
`npm install` and `npm run build` locally or through your CI/Vercel build before deploying.
