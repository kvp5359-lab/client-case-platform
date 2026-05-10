-- Supabase advisor `public_bucket_allows_listing`: the `docbuilder` storage
-- bucket had a single ALL-roles ALL-commands policy, which let unauthenticated
-- clients list, write, and delete objects via the REST API. Bucket stays
-- `public: true` so direct file URLs continue to resolve for anonymous
-- viewers — only the API surface (listing/upload/delete) is now restricted
-- to authenticated.
--
-- The `docbuilder-covers` bucket already required `authenticated`; left as-is.
-- A finer-grained per-owner restriction needs domain knowledge of the
-- separate docbuilder application that uses these buckets.

DROP POLICY IF EXISTS "Allow all on docbuilder bucket" ON storage.objects;

CREATE POLICY "docbuilder authenticated full access" ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'docbuilder')
  WITH CHECK (bucket_id = 'docbuilder');
