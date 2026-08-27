import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity } from '../lib/activityLog';

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .order('id', { ascending: true })
        .limit(1);

      if (error) throw error;
      setSettings(data && data.length > 0 ? data[0] : null);
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchSettings = coalesceRefetch(fetchSettings);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings();

    const channel = supabase
      .channel(`settings-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        refetchSettings
      )
      .subscribe();

    return () => {
      refetchSettings.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const updateSettings = async ({
    company_name,
    company_address,
    company_phone,
    company_email,
    logo_url,
    favicon_url,
    gemini_api_key,
    ai_enabled,
    separate_cube_prices,
    undo_enabled,
    // Lets a partial save say what it actually changed, instead of filling
    // Recent Actions with identical "Updated system settings" lines every
    // time a Feature Visibility switch is tapped.
    logDescription
  }) => {
    const { data: current, error: getErr } = await supabase
      .from('settings')
      .select('*')
      .order('id', { ascending: true })
      .limit(1);

    if (getErr) throw new Error(getErr.message);

    const settingsData = {
      company_name,
      company_address,
      company_phone,
      company_email,
      logo_url,
      favicon_url,
      updated_at: new Date().toISOString()
    };

    // Undefined means "not part of this save" — the Feature Visibility card
    // flips one switch at a time and must not overwrite the others.
    Object.keys(settingsData).forEach(key => {
      if (settingsData[key] === undefined) delete settingsData[key];
    });

    if (gemini_api_key !== undefined) {
      settingsData.gemini_api_key = gemini_api_key;
      // Also cache in localStorage for instant access
      if (gemini_api_key) {
        localStorage.setItem('saga_gemini_api_key', gemini_api_key);
      } else {
        localStorage.removeItem('saga_gemini_api_key');
      }
    }

    if (ai_enabled !== undefined) {
      settingsData.ai_enabled = ai_enabled;
      localStorage.setItem('saga_ai_enabled', ai_enabled ? 'true' : 'false');
      window.dispatchEvent(new Event('ai-enabled-changed'));
    }

    if (separate_cube_prices !== undefined) {
      settingsData.separate_cube_prices = separate_cube_prices;
    }

    if (undo_enabled !== undefined) {
      settingsData.undo_enabled = undo_enabled;
    }

    const describeError = (error) => {
      const missingColumn = error.code === 'PGRST204' || error.code === '42703';
      const touchesNewFlags = separate_cube_prices !== undefined || undo_enabled !== undefined;
      if (missingColumn && touchesNewFlags) {
        return 'This toggle needs the 20260827100000_settings_feature_toggles migration. Run it in Supabase, then try again.';
      }
      return error.message;
    };

    if (!current || current.length === 0) {
      const { error: insertErr } = await supabase
        .from('settings')
        .insert(settingsData);
      if (insertErr) throw new Error(describeError(insertErr));
    } else {
      const { error: updateErr } = await supabase
        .from('settings')
        .update(settingsData)
        .eq('id', current[0].id);
      if (updateErr) throw new Error(describeError(updateErr));
    }

    logActivity({
      action: 'update',
      entityType: 'settings',
      description: logDescription || 'Updated system settings'
    });
  };

  return {
    settings,
    isLoading,
    updateSettings
  };
}
