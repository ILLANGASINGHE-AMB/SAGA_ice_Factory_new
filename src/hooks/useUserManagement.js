import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

// Login accounts (Settings > User Management). Listing is a plain RPC —
// list_user_directory() is admin-gated server-side and is the only
// client-safe way to see what email each account signs in with (auth.users
// isn't exposed through PostgREST). Create/update/delete need the Supabase
// Admin Auth API, which only works with the service_role key — that runs
// exclusively inside the admin-users Edge Function, never in the browser.
export function useUserManagement() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('list_user_directory');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error("Failed to fetch user directory:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const refetchUsers = coalesceRefetch(fetchUsers);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();

    const channel = supabase
      .channel(`user-directory-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refetchUsers)
      .subscribe();

    return () => {
      refetchUsers.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

  const invokeAdminUsers = async (payload) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
    // supabase.functions.invoke only rejects via `error` on a network/HTTP
    // failure — a handled failure (bad password, duplicate email) comes back
    // as a 400 with a JSON body, which lands in `data.error` instead.
    if (error) throw new Error(error.message || 'Failed to reach the user management service');
    if (data?.error) throw new Error(data.error);
    return data?.data;
  };

  const addUser = async ({ email, username, fullName, password, role }) => {
    const { performedBy } = currentActor();
    const result = await invokeAdminUsers({
      action: 'create',
      email: email.trim(),
      username: username.trim(),
      fullName: (fullName || '').trim(),
      password,
      role
    });
    logActivity({ action: 'create', entityType: 'user', entityId: result?.id, entityLabel: username, description: `Created login account for ${username} (${role})`, performedBy });
    return result;
  };

  const updateUser = async (id, { email, username, fullName, password, role }) => {
    const { performedBy } = currentActor();
    const result = await invokeAdminUsers({
      action: 'update',
      id,
      email: email?.trim() || undefined,
      username: username?.trim() || undefined,
      fullName: fullName?.trim(),
      password: password || undefined,
      role
    });
    logActivity({ action: 'update', entityType: 'user', entityId: id, entityLabel: username, description: `Updated login account for ${username}${password ? ' (password changed)' : ''}`, performedBy });
    return result;
  };

  const deleteUser = async (id, label) => {
    const { performedBy } = currentActor();
    const result = await invokeAdminUsers({ action: 'delete', id });
    logActivity({ action: 'delete', entityType: 'user', entityId: id, entityLabel: label, description: `Deleted login account for ${label}`, performedBy });
    return result;
  };

  return {
    users,
    isLoading,
    addUser,
    updateUser,
    deleteUser
  };
}
