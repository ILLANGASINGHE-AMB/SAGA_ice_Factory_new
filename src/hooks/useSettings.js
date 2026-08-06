import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
    fetchSettings();

    const channel = supabase
      .channel(`settings-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        () => fetchSettings()
      )
      .subscribe();

    return () => {
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
    ai_enabled
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

    if (!current || current.length === 0) {
      const { error: insertErr } = await supabase
        .from('settings')
        .insert(settingsData);
      if (insertErr) throw new Error(insertErr.message);
    } else {
      const { error: updateErr } = await supabase
        .from('settings')
        .update(settingsData)
        .eq('id', current[0].id);
      if (updateErr) throw new Error(updateErr.message);
    }
  };

  return {
    settings,
    isLoading,
    updateSettings
  };
}
