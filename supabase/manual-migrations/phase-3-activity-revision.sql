-- Phase 3: Project Activity & Deliverable Revision Monitoring
-- Incremental migration for the existing Engineering PMIS.
-- Review the script and take a Supabase backup before applying.
-- This script does not drop existing tables or delete existing records.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend the existing project activity table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_activity
    ADD COLUMN IF NOT EXISTS activity_type text,
    ADD COLUMN IF NOT EXISTS entity_type text,
    ADD COLUMN IF NOT EXISTS entity_id uuid,
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Backfill a meaningful type for existing rows without changing their history.
UPDATE public.project_activity
SET activity_type = COALESCE(activity_type, 'project_updated'),
    entity_type = COALESCE(entity_type, 'project'),
    entity_id = COALESCE(entity_id, project_id),
    description = COALESCE(description, 'Existing project activity')
WHERE activity_type IS NULL
   OR entity_type IS NULL
   OR entity_id IS NULL
   OR description IS NULL;

CREATE INDEX IF NOT EXISTS project_activity_project_created_idx
    ON public.project_activity (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_activity_entity_idx
    ON public.project_activity (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 2. Helper for checking an explicit project assignment.
--    Management viewers must have assignment_type = 'Viewer'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_project_assignment(
    p_project_id uuid,
    p_assignment_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = p_project_id
          AND pm.user_id = auth.uid()
          AND pm.assignment_type = p_assignment_type
    );
$function$;

REVOKE ALL ON FUNCTION public.has_project_assignment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_project_assignment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_project_assignment(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Correct project-specific read access.
--    Admin: all projects.
--    Engineer: projects where the engineer is a member.
--    Viewer: projects with an explicit Viewer membership.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "projects visible by role" ON public.projects;
CREATE POLICY "projects visible by authorized membership"
ON public.projects
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        public.current_role() = 'engineer'::public.app_role
        AND public.is_project_member(id)
    )
    OR (
        public.current_role() = 'viewer'::public.app_role
        AND public.has_project_assignment(id, 'Viewer')
    )
);

DROP POLICY IF EXISTS "deliverables view" ON public.deliverables;
CREATE POLICY "deliverables view by authorized membership"
ON public.deliverables
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        public.current_role() = 'engineer'::public.app_role
        AND public.is_project_member(project_id)
    )
    OR (
        public.current_role() = 'viewer'::public.app_role
        AND public.has_project_assignment(project_id, 'Viewer')
    )
);

DROP POLICY IF EXISTS "activity view" ON public.project_activity;
CREATE POLICY "activity view by authorized membership"
ON public.project_activity
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        public.current_role() = 'engineer'::public.app_role
        AND public.is_project_member(project_id)
    )
    OR (
        public.current_role() = 'viewer'::public.app_role
        AND public.has_project_assignment(project_id, 'Viewer')
    )
);

DROP POLICY IF EXISTS "memberships visible" ON public.project_members;
CREATE POLICY "memberships visible by authorized membership"
ON public.project_members
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        public.current_role() = 'engineer'::public.app_role
        AND public.is_project_member(project_id)
    )
    OR (
        public.current_role() = 'viewer'::public.app_role
        AND public.has_project_assignment(project_id, 'Viewer')
    )
);

-- Viewers are read-only: only admins and project engineers may insert
-- activity directly. Trigger functions below write their own audit entries.
DROP POLICY IF EXISTS "activity insert" ON public.project_activity;
CREATE POLICY "activity insert by project team"
ON public.project_activity
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND (
        public.is_admin()
        OR (
            public.current_role() = 'engineer'::public.app_role
            AND public.is_project_member(project_id)
        )
    )
);

-- ---------------------------------------------------------------------------
-- 4. Create formal deliverable revision history.
--    No cascading FK is used intentionally: audit snapshots remain available
--    even if a deliverable is later deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deliverable_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    deliverable_id uuid NOT NULL,
    revision_number integer NOT NULL CHECK (revision_number >= 0),
    revision_reason text NOT NULL,
    revision_remarks text,
    snapshot jsonb NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT deliverable_revisions_deliverable_revision_key
        UNIQUE (deliverable_id, revision_number)
);

CREATE INDEX IF NOT EXISTS deliverable_revisions_project_created_idx
    ON public.deliverable_revisions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deliverable_revisions_deliverable_number_idx
    ON public.deliverable_revisions (deliverable_id, revision_number DESC);

ALTER TABLE public.deliverable_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliverable revisions view by authorized membership"
    ON public.deliverable_revisions;

CREATE POLICY "deliverable revisions view by authorized membership"
ON public.deliverable_revisions
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR (
        public.current_role() = 'engineer'::public.app_role
        AND public.is_project_member(project_id)
    )
    OR (
        public.current_role() = 'viewer'::public.app_role
        AND public.has_project_assignment(project_id, 'Viewer')
    )
);

GRANT SELECT ON public.deliverable_revisions TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON public.deliverable_revisions FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. RPC to create a formal revision.
--    Row-locking the deliverable serializes revision-number generation.
--    First revision is 0, displayed by the UI as Rev. 00.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_deliverable_revision(
    p_deliverable_id uuid,
    p_revision_reason text,
    p_revision_remarks text DEFAULT NULL
)
RETURNS TABLE (
    revision_id uuid,
    revision_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_deliverable public.deliverables%ROWTYPE;
    v_revision_number integer;
    v_revision_id uuid;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to create a revision.';
    END IF;

    IF p_revision_reason IS NULL OR btrim(p_revision_reason) = '' THEN
        RAISE EXCEPTION 'Revision reason is required.';
    END IF;

    SELECT d.*
      INTO v_deliverable
      FROM public.deliverables d
     WHERE d.id = p_deliverable_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deliverable not found.';
    END IF;

    IF NOT public.is_admin()
       AND NOT (
           public.current_role() = 'engineer'::public.app_role
           AND public.is_project_member(v_deliverable.project_id)
       )
    THEN
        RAISE EXCEPTION 'You are not authorized to create revisions for this deliverable.';
    END IF;

    SELECT COALESCE(MAX(r.revision_number), -1) + 1
      INTO v_revision_number
      FROM public.deliverable_revisions r
     WHERE r.deliverable_id = p_deliverable_id;

    INSERT INTO public.deliverable_revisions (
        project_id,
        deliverable_id,
        revision_number,
        revision_reason,
        revision_remarks,
        snapshot,
        created_by
    )
    VALUES (
        v_deliverable.project_id,
        v_deliverable.id,
        v_revision_number,
        btrim(p_revision_reason),
        p_revision_remarks,
        to_jsonb(v_deliverable),
        v_user_id
    )
    RETURNING id INTO v_revision_id;

    INSERT INTO public.project_activity (
        project_id,
        user_id,
        remarks,
        activity_type,
        entity_type,
        entity_id,
        description,
        metadata
    )
    VALUES (
        v_deliverable.project_id,
        v_user_id,
        p_revision_remarks,
        'deliverable_revision_created',
        'deliverable_revision',
        v_revision_id,
        'Created deliverable revision Rev. '
            || lpad(v_revision_number::text, 2, '0')
            || ': ' || btrim(p_revision_reason),
        jsonb_build_object(
            'deliverable_id', v_deliverable.id,
            'revision_id', v_revision_id,
            'revision_number', v_revision_number,
            'revision_reason', btrim(p_revision_reason),
            'revision_remarks', p_revision_remarks
        )
    );

    RETURN QUERY SELECT v_revision_id, v_revision_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_deliverable_revision(uuid, text, text)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deliverable_revision(uuid, text, text)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.create_deliverable_revision(uuid, text, text)
    TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Expand project update logging.
--    Preserve the existing trigger name and existing status/progress columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_project_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_activity_type text;
    v_description text;
BEGIN
    IF (to_jsonb(OLD) - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(NEW) - 'updated_at')
    THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            v_activity_type := 'project_status_changed';
            v_description := 'Project status changed';
        ELSIF OLD.progress IS DISTINCT FROM NEW.progress THEN
            v_activity_type := 'project_progress_changed';
            v_description := 'Project progress updated';
        ELSE
            v_activity_type := 'project_updated';
            v_description := 'Project details updated';
        END IF;

        INSERT INTO public.project_activity (
            project_id,
            user_id,
            previous_status,
            new_status,
            previous_progress,
            new_progress,
            remarks,
            activity_type,
            entity_type,
            entity_id,
            description,
            metadata
        )
        VALUES (
            NEW.id,
            auth.uid(),
            OLD.status,
            NEW.status,
            OLD.progress,
            NEW.progress,
            NEW.remarks,
            v_activity_type,
            'project',
            NEW.id,
            v_description,
            jsonb_build_object(
                'previous', to_jsonb(OLD) - 'updated_at',
                'new', to_jsonb(NEW) - 'updated_at'
            )
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- Record project creation as well as updates.
CREATE OR REPLACE FUNCTION public.log_project_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    INSERT INTO public.project_activity (
        project_id,
        user_id,
        new_status,
        new_progress,
        remarks,
        activity_type,
        entity_type,
        entity_id,
        description,
        metadata
    )
    VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.created_by),
        NEW.status,
        NEW.progress,
        NEW.remarks,
        'project_created',
        'project',
        NEW.id,
        'Project created',
        jsonb_build_object('new', to_jsonb(NEW) - 'updated_at')
    );

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS projects_activity_created ON public.projects;
CREATE TRIGGER projects_activity_created
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.log_project_created();

-- ---------------------------------------------------------------------------
-- 7. Automatically log deliverable insert, update, move, and delete events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_deliverable_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.project_activity (
            project_id, user_id, new_progress, remarks,
            activity_type, entity_type, entity_id, description, metadata
        )
        VALUES (
            NEW.project_id, v_user_id, NEW.progress, NEW.remarks,
            'deliverable_created', 'deliverable', NEW.id,
            'Deliverable created',
            jsonb_build_object('new', to_jsonb(NEW))
        );
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.project_activity (
            project_id, user_id, previous_progress, remarks,
            activity_type, entity_type, entity_id, description, metadata
        )
        VALUES (
            OLD.project_id, v_user_id, OLD.progress, OLD.remarks,
            'deliverable_deleted', 'deliverable', OLD.id,
            'Deliverable deleted',
            jsonb_build_object('previous', to_jsonb(OLD))
        );
        RETURN OLD;

    ELSE
        IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
            INSERT INTO public.project_activity (
                project_id, user_id, previous_progress, remarks,
                activity_type, entity_type, entity_id, description, metadata
            )
            VALUES (
                OLD.project_id, v_user_id, OLD.progress, OLD.remarks,
                'deliverable_moved_out', 'deliverable', OLD.id,
                'Deliverable moved to another project',
                jsonb_build_object('previous', to_jsonb(OLD), 'new', to_jsonb(NEW))
            );

            INSERT INTO public.project_activity (
                project_id, user_id, new_progress, remarks,
                activity_type, entity_type, entity_id, description, metadata
            )
            VALUES (
                NEW.project_id, v_user_id, NEW.progress, NEW.remarks,
                'deliverable_moved_in', 'deliverable', NEW.id,
                'Deliverable received from another project',
                jsonb_build_object('previous', to_jsonb(OLD), 'new', to_jsonb(NEW))
            );
        ELSIF (to_jsonb(OLD) - 'updated_at')
              IS DISTINCT FROM
              (to_jsonb(NEW) - 'updated_at')
        THEN
            INSERT INTO public.project_activity (
                project_id, user_id, previous_progress, new_progress, remarks,
                activity_type, entity_type, entity_id, description, metadata
            )
            VALUES (
                NEW.project_id, v_user_id, OLD.progress, NEW.progress, NEW.remarks,
                CASE
                    WHEN OLD.status IS DISTINCT FROM NEW.status
                        THEN 'deliverable_status_changed'
                    WHEN OLD.progress IS DISTINCT FROM NEW.progress
                        THEN 'deliverable_progress_changed'
                    ELSE 'deliverable_updated'
                END,
                'deliverable',
                NEW.id,
                CASE
                    WHEN OLD.status IS DISTINCT FROM NEW.status
                        THEN 'Deliverable status changed'
                    WHEN OLD.progress IS DISTINCT FROM NEW.progress
                        THEN 'Deliverable progress updated'
                    ELSE 'Deliverable details updated'
                END,
                jsonb_build_object(
                    'previous', to_jsonb(OLD) - 'updated_at',
                    'new', to_jsonb(NEW) - 'updated_at'
                )
            );
        END IF;

        RETURN NEW;
    END IF;
END;
$function$;

DROP TRIGGER IF EXISTS deliverables_activity_log ON public.deliverables;
CREATE TRIGGER deliverables_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.deliverables
FOR EACH ROW
EXECUTE FUNCTION public.log_deliverable_change();

-- ---------------------------------------------------------------------------
-- 8. Protect historical audit records from direct edits/deletes.
--    Trigger functions can still append records as their owner.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE
    ON public.project_activity FROM authenticated, anon;

-- Trigger-only functions should not be callable as ordinary RPC functions.
REVOKE ALL ON FUNCTION public.log_project_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_project_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_deliverable_change() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-migration verification
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'project_activity'
-- ORDER BY ordinal_position;
--
-- SELECT * FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('projects','deliverables','project_activity',
--                     'project_members','deliverable_revisions')
-- ORDER BY tablename, policyname;
--
-- SELECT event_object_table, trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table IN ('projects','deliverables')
-- ORDER BY event_object_table, trigger_name;
--
-- IMPORTANT:
-- Project-member management remains admin-only under the existing policy.
-- Add viewer memberships using assignment_type = 'Viewer'.
-- Existing project_members rows with assignment_type = 'Engineer' do not
-- automatically grant viewer access.
