-- One expense can be up to ₱999,999,999.99 (the millions). The column was
-- numeric(10,2), which stops at ₱99,999,999.99. Widening a numeric column
-- keeps every existing value as it is.
alter table public.expenses alter column amount type numeric(12,2);
