-- Phase 3 Realtime publication additions.
-- Safe to run after the Phase 3 activity/revision migration.
-- Adds only missing tables; does not remove existing publication members.

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'project_activity',
        'deliverable_revisions',
        'project_members'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = v_table
        ) THEN
            EXECUTE format(
                'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
                v_table
            );
        END IF;
    END LOOP;
END $$;
