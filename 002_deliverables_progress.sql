-- Engineering PMIS: deliverables progress roll-up (equal weighting)
-- Run AFTER 001_initial_schema.sql in Supabase SQL Editor.

create index if not exists deliverables_project_id_idx on public.deliverables(project_id);
create index if not exists deliverables_target_date_idx on public.deliverables(target_date);
create index if not exists deliverables_assigned_to_idx on public.deliverables(assigned_to);

-- Keep completion percentage consistent with status.
create or replace function public.normalize_deliverable_progress()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.status = 'Completed' then
    new.progress := 100;
    if new.actual_submission_date is null then
      new.actual_submission_date := current_date;
    end if;
  elsif new.progress = 100 and new.status <> 'Completed' then
    new.status := 'Completed';
    if new.actual_submission_date is null then
      new.actual_submission_date := current_date;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists deliverable_normalize_progress on public.deliverables;
create trigger deliverable_normalize_progress
before insert or update on public.deliverables
for each row execute function public.normalize_deliverable_progress();

-- Equal weighting: project progress = arithmetic mean of all deliverable progress values.
-- Projects without deliverables remain at 0%.
create or replace function public.refresh_project_progress(pid uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare avg_progress integer;
begin
  select coalesce(round(avg(progress))::integer, 0)
    into avg_progress
    from public.deliverables
   where project_id = pid;

  update public.projects
     set progress = avg_progress,
         updated_at = now()
   where id = pid;
end $$;

revoke all on function public.refresh_project_progress(uuid) from public, anon, authenticated;

create or replace function public.sync_project_progress_from_deliverables()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_project_progress(old.project_id);
    return old;
  elsif tg_op = 'UPDATE' then
    if old.project_id is distinct from new.project_id then
      perform public.refresh_project_progress(old.project_id);
    end if;
    perform public.refresh_project_progress(new.project_id);
    return new;
  else
    perform public.refresh_project_progress(new.project_id);
    return new;
  end if;
end $$;

drop trigger if exists deliverables_project_progress on public.deliverables;
create trigger deliverables_project_progress
after insert or update or delete on public.deliverables
for each row execute function public.sync_project_progress_from_deliverables();

-- Recalculate existing projects that already have deliverables.
update public.projects p
   set progress = coalesce((
     select round(avg(d.progress))::integer
       from public.deliverables d
      where d.project_id = p.id
   ), 0)
 where exists (select 1 from public.deliverables d where d.project_id = p.id);

-- Explicit table privileges; RLS policies remain the row-level security boundary.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.deliverables to authenticated;
grant select, update on public.projects to authenticated;

-- Ensure Realtime can publish deliverable changes. Existing membership is preserved.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname='supabase_realtime'
       and schemaname='public'
       and tablename='deliverables'
  ) then
    alter publication supabase_realtime add table public.deliverables;
  end if;
end $$;
