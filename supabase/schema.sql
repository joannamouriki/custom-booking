create table bookings (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz unique not null,
  attendee_name text not null,
  attendee_email text not null,
  google_event_id text unique,
  meet_url text,
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;
-- Only server-side functions will access this table; do not add public policies.
