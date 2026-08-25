/* eslint-disable react-refresh/only-export-components --
   Colocating a context provider with its consumer hook is the idiomatic
   shape for this pattern, and splitting them would only buy finer Fast
   Refresh granularity in dev. Disabled deliberately so `npx eslint .`
   can be a passing gate in CI rather than a wall of known noise. */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Module-level mirror of the logged-in user, kept in sync alongside the
// `user` state below. Lets plain async helpers (e.g. activity logging,
// soft-delete calls inside hooks) read "who is performing this action"
// without needing to thread it through every function signature — those
// helpers run outside React component bodies, so they can't call useAuth().
let currentUserRef = null;
export function getCurrentUser() {
  return currentUserRef;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keeps currentUserRef (read by getCurrentUser()) in sync with React state.
  const setUserAndRef = (u) => {
    currentUserRef = u;
    setUser(u);
  };

  // useCallback so the auth subscription effect below can list it as a
  // dependency honestly instead of silencing the lint rule: without it the
  // function is a new identity every render and the effect would resubscribe
  // to Supabase auth on each one.
  const fetchUserProfile = useCallback(async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', authUser.id)
        .single();

      if (error) throw error;

      setUserAndRef({
        id: authUser.id,
        email: authUser.email,
        fullName: data.full_name,
        role: data.role
      });
    } catch (err) {
      console.warn("Failed to fetch profile, using metadata fallback:", err);
      setUserAndRef({
        id: authUser.id,
        email: authUser.email,
        fullName: authUser.user_metadata?.full_name || 'Staff Operator',
        role: authUser.user_metadata?.role || 'user'
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear session on app mount / browser refresh
  useEffect(() => {
    supabase.auth.signOut().finally(() => {
      setUserAndRef(null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserProfile(session.user);
      } else {
        setUserAndRef(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const login = async (email, password) => {
    let formattedEmail = email.toLowerCase().trim();
    
    // Shorthand credentials mapping
    if (formattedEmail === 'admin') {
      formattedEmail = 'admin@sagacious.com';
    } else if (formattedEmail === 'user') {
      formattedEmail = 'user@sagacious.com';
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password: password
    });

    if (error) {
      throw new Error(error.message);
    }

    // Fetch profile synchronously
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', data.user.id)
      .single();

    const sessionData = {
      id: data.user.id,
      email: data.user.email,
      fullName: profile?.full_name || 'Staff Operator',
      role: profile?.role || 'user'
    };

    setUserAndRef(sessionData);
    return sessionData;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUserAndRef(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
