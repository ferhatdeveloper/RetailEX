-- Gider kategorisini ekleyen kişinin görünen adı.
-- Sistem tohumlarında boş kalır. Tutar, işaret, kur ve fiş no değişmez.

ALTER TABLE public.expense_categories
    ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(120);

COMMENT ON COLUMN public.expense_categories.created_by_name IS
    'Kategoriyi ekleyen kişinin görünen adı. Sistem tohumlarında boş kalır.';
