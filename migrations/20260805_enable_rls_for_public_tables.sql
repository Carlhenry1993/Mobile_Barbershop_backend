DO $mrr_rls$
DECLARE
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  unsecured_table record;
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.services TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.services TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.services TO service_role;
      IF to_regclass('public.services_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.services_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'services' AND policyname = 'services_public_read_active'
    ) THEN
      CREATE POLICY services_public_read_active
      ON public.services
      FOR SELECT
      USING (active = true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'services' AND policyname = 'services_service_role_manage'
    ) THEN
      CREATE POLICY services_service_role_manage
      ON public.services
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.barbers') IS NOT NULL THEN
    ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.barbers TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.barbers TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.barbers TO service_role;
      IF to_regclass('public.barbers_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.barbers_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'barbers' AND policyname = 'barbers_public_read_active'
    ) THEN
      CREATE POLICY barbers_public_read_active
      ON public.barbers
      FOR SELECT
      USING (active = true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'barbers' AND policyname = 'barbers_service_role_manage'
    ) THEN
      CREATE POLICY barbers_service_role_manage
      ON public.barbers
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.gallery_photos') IS NOT NULL THEN
    ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.gallery_photos TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.gallery_photos TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.gallery_photos TO service_role;
      IF to_regclass('public.gallery_photos_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.gallery_photos_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'gallery_photos' AND policyname = 'gallery_photos_public_read_published'
    ) THEN
      CREATE POLICY gallery_photos_public_read_published
      ON public.gallery_photos
      FOR SELECT
      USING (is_published = true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'gallery_photos' AND policyname = 'gallery_photos_service_role_manage'
    ) THEN
      CREATE POLICY gallery_photos_service_role_manage
      ON public.gallery_photos
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.products') IS NOT NULL THEN
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.products TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.products TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.products TO service_role;
      IF to_regclass('public.products_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.products_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_public_read_published'
    ) THEN
      CREATE POLICY products_public_read_published
      ON public.products
      FOR SELECT
      USING (is_published = true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_service_role_manage'
    ) THEN
      CREATE POLICY products_service_role_manage
      ON public.products
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.client_reviews') IS NOT NULL THEN
    ALTER TABLE public.client_reviews ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.client_reviews TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.client_reviews TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.client_reviews TO service_role;
      IF to_regclass('public.client_reviews_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.client_reviews_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_reviews' AND policyname = 'client_reviews_public_read_approved'
    ) THEN
      CREATE POLICY client_reviews_public_read_approved
      ON public.client_reviews
      FOR SELECT
      USING (is_approved = true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_reviews' AND policyname = 'client_reviews_service_role_manage'
    ) THEN
      CREATE POLICY client_reviews_service_role_manage
      ON public.client_reviews
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.announcements') IS NOT NULL THEN
    ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

    IF has_anon THEN
      GRANT SELECT ON public.announcements TO anon;
    END IF;
    IF has_authenticated THEN
      GRANT SELECT ON public.announcements TO authenticated;
    END IF;
    IF has_service_role THEN
      GRANT ALL ON public.announcements TO service_role;
      IF to_regclass('public.announcements_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.announcements_id_seq TO service_role;
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'announcements_public_read_all'
    ) THEN
      CREATE POLICY announcements_public_read_all
      ON public.announcements
      FOR SELECT
      USING (true);
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'announcements_service_role_manage'
    ) THEN
      CREATE POLICY announcements_service_role_manage
      ON public.announcements
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    IF has_service_role THEN
      GRANT ALL ON public.users TO service_role;
      IF to_regclass('public.users_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq TO service_role;
      END IF;
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_service_role_manage'
    ) THEN
      CREATE POLICY users_service_role_manage
      ON public.users
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

    IF has_service_role THEN
      GRANT ALL ON public.bookings TO service_role;
      IF to_regclass('public.bookings_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.bookings_id_seq TO service_role;
      END IF;
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'bookings_service_role_manage'
    ) THEN
      CREATE POLICY bookings_service_role_manage
      ON public.bookings
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

    IF has_service_role THEN
      GRANT ALL ON public.messages TO service_role;
      IF to_regclass('public.messages_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.messages_id_seq TO service_role;
      END IF;
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_service_role_manage'
    ) THEN
      CREATE POLICY messages_service_role_manage
      ON public.messages
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  IF to_regclass('public.barber_blocks') IS NOT NULL THEN
    ALTER TABLE public.barber_blocks ENABLE ROW LEVEL SECURITY;

    IF has_service_role THEN
      GRANT ALL ON public.barber_blocks TO service_role;
      IF to_regclass('public.barber_blocks_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.barber_blocks_id_seq TO service_role;
      END IF;
    END IF;

    IF has_service_role AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'barber_blocks' AND policyname = 'barber_blocks_service_role_manage'
    ) THEN
      CREATE POLICY barber_blocks_service_role_manage
      ON public.barber_blocks
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    END IF;
  END IF;

  FOR unsecured_table IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      unsecured_table.schema_name,
      unsecured_table.table_name
    );
  END LOOP;
END
$mrr_rls$;
