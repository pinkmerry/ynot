alter table public.profiles
add column if not exists full_name text,
add column if not exists phone text,
add column if not exists address_line1 text,
add column if not exists address_line2 text,
add column if not exists subdistrict text,
add column if not exists district text,
add column if not exists province text,
add column if not exists postal_code text,
add column if not exists country text default 'Thailand',
add column if not exists delivery_note text;
