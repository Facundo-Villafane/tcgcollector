create table if not exists public.user_collection (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_card_number text,
  is_public boolean not null default true,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_number text not null,
  quantity_required integer not null check (quantity_required between 1 and 50),
  primary key (deck_id, card_number)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'deck_cards_quantity_required_check'
      and conrelid = 'public.deck_cards'::regclass
  ) then
    alter table public.deck_cards drop constraint deck_cards_quantity_required_check;
  end if;

  alter table public.deck_cards
    add constraint deck_cards_quantity_required_check
    check (quantity_required between 1 and 50);
end $$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.deck_likes (
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, user_id)
);

create table if not exists public.card_prices (
  card_number text primary key,
  source text not null default 'manual',
  market_price numeric(10, 2),
  low_price numeric(10, 2),
  currency text not null default 'USD',
  price_url text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_collection enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.deck_likes enable row level security;
alter table public.card_prices enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_snapshots enable row level security;

drop policy if exists "Users can manage their collection" on public.user_collection;
create policy "Users can manage their collection"
on public.user_collection
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Public profiles are readable" on public.user_profiles;
create policy "Public profiles are readable"
on public.user_profiles
for select
using (true);

drop policy if exists "Users can manage own profile" on public.user_profiles;
create policy "Users can manage own profile"
on public.user_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own snapshots" on public.user_snapshots;
create policy "Users can manage own snapshots"
on public.user_snapshots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own or public decks" on public.decks;
create policy "Users can read own or public decks"
on public.decks
for select
using (is_public = true or auth.uid() = user_id);

drop policy if exists "Users can create own decks" on public.decks;
create policy "Users can create own decks"
on public.decks
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own decks" on public.decks;
create policy "Users can update own decks"
on public.decks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own decks" on public.decks;
create policy "Users can delete own decks"
on public.decks
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read cards in visible decks" on public.deck_cards;
create policy "Users can read cards in visible decks"
on public.deck_cards
for select
using (
  exists (
    select 1 from public.decks
    where decks.id = deck_cards.deck_id
      and (decks.is_public = true or decks.user_id = auth.uid())
  )
);

drop policy if exists "Users can manage cards in own decks" on public.deck_cards;
create policy "Users can manage cards in own decks"
on public.deck_cards
for all
using (
  exists (
    select 1 from public.decks
    where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.decks
    where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
  )
);

drop policy if exists "Anyone can read likes" on public.deck_likes;
create policy "Anyone can read likes"
on public.deck_likes
for select
using (true);

drop policy if exists "Users can like public decks" on public.deck_likes;
create policy "Users can like public decks"
on public.deck_likes
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.decks
    where decks.id = deck_likes.deck_id
      and decks.is_public = true
  )
);

drop policy if exists "Users can unlike as themselves" on public.deck_likes;
create policy "Users can unlike as themselves"
on public.deck_likes
for delete
using (auth.uid() = user_id);

drop policy if exists "Anyone can read card prices" on public.card_prices;
create policy "Anyone can read card prices"
on public.card_prices
for select
using (true);

create or replace function public.increment_deck_view(deck_id_arg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.decks
  set view_count = view_count + 1
  where id = deck_id_arg
    and is_public = true;
end;
$$;

grant execute on function public.increment_deck_view(uuid) to anon, authenticated;
