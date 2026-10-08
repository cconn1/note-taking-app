-- SITREP schema. Paste into Supabase Dashboard → SQL Editor → Run.
-- "Sessions" in the UI = the pages table.

create table public.pages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  title            text not null default '',
  date             date not null default current_date,
  type             text not null default 'Other'
                     check (type in ('Staff Meeting', 'Daily', 'Other')),
  notes            text not null default '',
  ink              jsonb not null default '[]',
  notes_updated_at timestamptz not null default now(),
  ink_updated_at   timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)  -- target of the tasks (page_id, user_id) foreign key
);

-- Server-side timestamps drive the per-field conflict check, so device clocks don't matter.
create function public.touch_page() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.notes is distinct from old.notes then new.notes_updated_at := now(); end if;
  if new.ink   is distinct from old.ink   then new.ink_updated_at   := now(); end if;
  return new;
end $$;

create trigger touch_page before update on public.pages
  for each row execute function public.touch_page();

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  page_id      uuid,  -- null = Inbox
  text         text not null,
  due_date     date,
  sort_order   double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  completed_at timestamptz,  -- null = open
  done         boolean generated always as (completed_at is not null) stored,
  -- A task can only link to your own page; deleting the page moves its tasks to the Inbox.
  foreign key (page_id, user_id) references public.pages (id, user_id) on delete set null (page_id)
);

create index on public.pages (user_id, updated_at desc);
create index on public.pages (user_id, date desc);
create index on public.tasks (user_id, completed_at, due_date);
create index on public.tasks (page_id);

alter table public.pages enable row level security;
alter table public.tasks enable row level security;

create policy "own pages" on public.pages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Explicit, in case the project doesn't auto-expose new tables to the API. RLS still applies.
grant select, insert, update, delete on public.pages, public.tasks to authenticated;
