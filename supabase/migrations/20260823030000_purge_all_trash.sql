-- The `trash` table intentionally has no delete policy (see
-- 20260823020500_trash_recovery.sql) so a plain `.delete()` from the client
-- silently removes zero rows under RLS. "Clear All Data" in Settings needs
-- to actually empty it during a full database wipe, so give admins a
-- dedicated security-definer function for that instead of a per-item
-- purge_trash_item loop.
create or replace function public.purge_all_trash()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can permanently delete trash items';
  end if;

  -- `where true`, not a bare `delete from public.trash`: this runs as the
  -- function owner (postgres on Supabase), which has pg-safeupdate enabled
  -- and rejects any DELETE/UPDATE without a WHERE clause.
  delete from public.trash where true;
end;
$$;

grant execute on function public.purge_all_trash() to authenticated;
