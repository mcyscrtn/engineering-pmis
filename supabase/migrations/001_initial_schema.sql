-- Engineering PMIS initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','engineer','viewer');
create type public.project_status as enum (
 'Not Yet Started','Ongoing','For Internal Design Review','For Submission to Client',
 'For Client Review / Approval','For Revision / Incorporation of Comments',
 'For AFC','Completed','On Hold','Cancelled'
);

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 position text,
 role public.app_role not null default 'viewer',
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
-- Automatically provision a least-privilege profile for each new authenticated user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,full_name,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''), 'viewer')
 on conflict(id) do nothing;
 return new;
end $$;
create trigger on_auth_user_created
 after insert on auth.users
 for each row execute procedure public.handle_new_user();

create table public.projects (
 id uuid primary key default gen_random_uuid(),
 project_code text not null unique,
 name text not null,
 client text,
 location text,
 description text,
 project_manager uuid references public.profiles(id),
 status public.project_status not null default 'Not Yet Started',
 progress integer not null default 0 check(progress between 0 and 100),
 priority text not null default 'Medium' check(priority in ('High','Medium','Low')),
 start_date date,
 target_date date,
 actual_completion_date date,
 remarks text,
 archived_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.project_members (
 project_id uuid references public.projects(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 assignment_type text not null default 'Engineer',
 primary key(project_id,user_id,assignment_type)
);
create table public.deliverables (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 description text not null,
 discipline text not null,
 assigned_to uuid references public.profiles(id),
 date_assigned date,
 target_date date,
 actual_submission_date date,
 status text not null default 'Not Yet Started',
 progress integer not null default 0 check(progress between 0 and 100),
 remarks text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.project_activity (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid references public.profiles(id),
 previous_status public.project_status,
 new_status public.project_status,
 previous_progress integer,
 new_progress integer,
 remarks text,
 created_at timestamptz not null default now()
);
create table public.project_documents (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 deliverable_id uuid references public.deliverables(id) on delete set null,
 file_name text not null,
 storage_path text not null,
 discipline text,
 document_type text,
 revision text,
 description text,
 uploaded_by uuid references public.profiles(id),
 uploaded_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references public.profiles(id) on delete cascade,
 title text not null,
 body text not null,
 read_at timestamptz,
 created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and is_active=true $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role()='admin',false) $$;
create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_admin() or exists(select 1 from public.project_members where project_id=pid and user_id=auth.uid()) $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger deliverables_updated before update on public.deliverables for each row execute function public.set_updated_at();

create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if old.status is distinct from new.status or old.progress is distinct from new.progress or old.remarks is distinct from new.remarks then
  insert into public.project_activity(project_id,user_id,previous_status,new_status,previous_progress,new_progress,remarks)
  values(new.id,auth.uid(),old.status,new.status,old.progress,new.progress,new.remarks);
 end if;
 return new;
end $$;
create trigger project_change_log after update on public.projects for each row execute function public.log_project_change();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.deliverables enable row level security;
alter table public.project_activity enable row level security;
alter table public.project_documents enable row level security;
alter table public.notifications enable row level security;

create policy "profiles visible to authenticated" on public.profiles for select to authenticated using (true);
create policy "admins manage profiles" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "projects visible by role" on public.projects for select to authenticated using(public.current_role()='viewer' or public.is_project_member(id));
create policy "admins insert projects" on public.projects for insert to authenticated with check(public.is_admin());
create policy "admins update projects" on public.projects for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins delete projects" on public.projects for delete to authenticated using(public.is_admin());
create policy "members update assigned projects" on public.projects for update to authenticated using(public.is_project_member(id) and public.current_role()='engineer') with check(public.is_project_member(id) and public.current_role()='engineer');
create policy "memberships visible" on public.project_members for select to authenticated using(public.current_role()='viewer' or public.is_project_member(project_id));
create policy "admins manage memberships" on public.project_members for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "deliverables view" on public.deliverables for select to authenticated using(public.current_role()='viewer' or public.is_project_member(project_id));
create policy "assigned members manage deliverables" on public.deliverables for all to authenticated using(public.is_admin() or (public.current_role()='engineer' and public.is_project_member(project_id))) with check(public.is_admin() or (public.current_role()='engineer' and public.is_project_member(project_id)));
create policy "activity view" on public.project_activity for select to authenticated using(public.current_role()='viewer' or public.is_project_member(project_id));
create policy "activity insert" on public.project_activity for insert to authenticated with check(auth.uid()=user_id and public.is_project_member(project_id));
create policy "documents view" on public.project_documents for select to authenticated using(public.current_role()='viewer' or public.is_project_member(project_id));
create policy "members upload documents" on public.project_documents for insert to authenticated with check(public.is_project_member(project_id) and uploaded_by=auth.uid());
create policy "members update documents" on public.project_documents for update to authenticated using(public.is_project_member(project_id) and public.current_role() in ('admin','engineer')) with check(public.is_project_member(project_id));
create policy "admins delete documents" on public.project_documents for delete to authenticated using(public.is_admin());
create policy "own notifications" on public.notifications for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-documents','project-documents',false,52428800,
 array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/acad','application/octet-stream'])
on conflict(id) do nothing;
create policy "project docs access" on storage.objects for select to authenticated using(bucket_id='project-documents');
create policy "project docs upload" on storage.objects for insert to authenticated with check(bucket_id='project-documents');
create policy "project docs update" on storage.objects for update to authenticated using(bucket_id='project-documents') with check(bucket_id='project-documents');
