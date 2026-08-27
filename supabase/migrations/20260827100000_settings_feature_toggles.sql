-- Feature visibility toggles (Settings → Feature Visibility)
--
-- Two operator-facing switches that change how other screens behave, stored
-- on `settings` rather than in localStorage: this system runs on a shared
-- factory tablet plus office machines, and a per-device preference would let
-- two operators disagree about whether Production and Resell are priced
-- separately — which is an accounting question, not a display preference.
--
--   separate_cube_prices  ON  (default, current behaviour): Inventory prices
--                             Production and Resell cubes independently.
--                         OFF: Inventory shows a single price that is written
--                             to both sellable pools at once.
--
--   undo_enabled          OFF (default): Recent Actions is a read-only log.
--                         ON: deletions in Recent Actions get an Undo button,
--                             which restores the row from its Trash snapshot.
--                             Defaults OFF so the button only appears where an
--                             admin has deliberately asked for it.

alter table public.settings
  add column if not exists separate_cube_prices boolean not null default true;

alter table public.settings
  add column if not exists undo_enabled boolean not null default false;
