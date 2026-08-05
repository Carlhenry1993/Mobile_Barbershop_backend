DO $mrr_rls$
DECLARE
  has_service_role boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  unsecured_table record;
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

    IF has_service_role THEN
      GRANT ALL ON public.services TO service_role;
      IF to_regclass('public.services_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.services_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS services_public_read_active ON public.services;

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

    IF has_service_role THEN
      GRANT ALL ON public.barbers TO service_role;
      IF to_regclass('public.barbers_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.barbers_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS barbers_public_read_active ON public.barbers;

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

    IF has_service_role THEN
      GRANT ALL ON public.gallery_photos TO service_role;
      IF to_regclass('public.gallery_photos_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.gallery_photos_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS gallery_photos_public_read_published ON public.gallery_photos;

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

    IF has_service_role THEN
      GRANT ALL ON public.products TO service_role;
      IF to_regclass('public.products_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.products_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS products_public_read_published ON public.products;

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

    IF has_service_role THEN
      GRANT ALL ON public.client_reviews TO service_role;
      IF to_regclass('public.client_reviews_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.client_reviews_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS client_reviews_public_read_approved ON public.client_reviews;

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

    IF has_service_role THEN
      GRANT ALL ON public.announcements TO service_role;
      IF to_regclass('public.announcements_id_seq') IS NOT NULL THEN
        GRANT USAGE, SELECT ON SEQUENCE public.announcements_id_seq TO service_role;
      END IF;
    END IF;

    DROP POLICY IF EXISTS announcements_public_read_all ON public.announcements;

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

  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE USAGE, SELECT ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not update PUBLIC default privileges: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE USAGE, SELECT ON SEQUENCES FROM anon;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE EXECUTE ON FUNCTIONS FROM anon;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not update anon default privileges: %', SQLERRM;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE USAGE, SELECT ON SEQUENCES FROM authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not update authenticated default privileges: %', SQLERRM;
    END;
  END IF;
END
$mrr_rls$;
