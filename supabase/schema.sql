create table bookings (
  id uuid primary key default gen_random_uuid(),
  manage_token uuid unique not null default gen_random_uuid(),
  start_at timestamptz unique not null,
  attendee_name text not null,
  attendee_email text not null,
  google_event_id text unique,
  meet_url text,
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;
-- Only server-side functions will access this table; do not add public policies.

-- Run this once if the bookings table already exists:
-- alter table bookings add column if not exists manage_token uuid unique default gen_random_uuid();

create table if not exists google_tokens (
  id text primary key check (id = 'primary'),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table google_tokens enable row level security;
-- Only Netlify's server-side functions use this table; do not add public policies.
