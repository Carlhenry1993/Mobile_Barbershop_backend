DO $mrr_product_subcategory$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS subcategory VARCHAR(120);

    CREATE INDEX IF NOT EXISTS products_category_subcategory_idx
      ON public.products(category, subcategory);
  END IF;
END
$mrr_product_subcategory$;
