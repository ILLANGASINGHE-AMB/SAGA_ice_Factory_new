import { supabase } from './supabase';
import { getCurrentUser } from '../context/AuthContext';

// Fire-and-forget: a logging failure must never block the user action that
// triggered it, so callers don't (and shouldn't) await this.
export async function logActivity({ action, entityType, entityId, entityLabel, description, performedBy, performedByRole }) {
  const current = getCurrentUser();
  try {
    await supabase.from('activity_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_label: entityLabel || null,
      description,
      performed_by: performedBy || current?.fullName || 'System',
      performed_by_role: performedByRole || current?.role || null
    });
  } catch (err) {
    console.warn('Failed to log activity:', err);
  }
}

// Used by hook delete functions to fill soft_delete_row's p_deleted_by /
// p_deleted_by_role RPC params.
export function currentActor() {
  const current = getCurrentUser();
  return {
    performedBy: current?.fullName || 'System',
    performedByRole: current?.role || null
  };
}
