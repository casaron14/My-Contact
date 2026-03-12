-- =============================================================
-- Booking Slots Table
-- Run this once in your Supabase SQL editor before going live.
-- =============================================================

CREATE TABLE IF NOT EXISTS booked_slots (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id      TEXT        NOT NULL,                       -- matches the ID returned by Google Sheets append
  slot_datetime   TIMESTAMPTZ NOT NULL UNIQUE,                -- UNIQUE prevents double-booking
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast range queries used by getBusySlotDatetimes()
CREATE INDEX IF NOT EXISTS idx_booked_slots_datetime
  ON booked_slots (slot_datetime);

-- =============================================================
-- Row Level Security (RLS)
-- Only the service-role key (server-side) can read/write.
-- The anon/public key cannot touch this table.
-- =============================================================

ALTER TABLE booked_slots ENABLE ROW LEVEL SECURITY;

-- No public access — all access goes through the service-role key used in the API
-- (If you ever need a read-only public policy, add it here.)

-- =============================================================
-- Full Booking Details Table
-- Stores the complete booking record for site reference
-- and reporting. Parallel to the Google Sheets record.
-- =============================================================

CREATE TABLE IF NOT EXISTS bookings (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id    TEXT        NOT NULL UNIQUE,       -- matches the ID returned by Google Sheets append
  slot_datetime TIMESTAMPTZ NOT NULL,
  full_name     TEXT        NOT NULL DEFAULT '',
  email         TEXT        NOT NULL DEFAULT '',
  phone         TEXT        NOT NULL DEFAULT '',
  intent        TEXT                 DEFAULT '',
  status        TEXT                 DEFAULT 'Booking Confirmed',
  source        TEXT                 DEFAULT 'web-form',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups by email (duplicate check / admin view)
CREATE INDEX IF NOT EXISTS idx_bookings_email
  ON bookings (email);

-- Index for lookups by slot (join with booked_slots)
CREATE INDEX IF NOT EXISTS idx_bookings_slot_datetime
  ON bookings (slot_datetime);

-- RLS: service-role key only — no public access
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
