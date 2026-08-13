import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

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

  const fetchUserProfile = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', authUser.id)
        .single();
      
      if (error) throw error;

      setUser({
        email: authUser.email,
        fullName: data.full_name,
        role: data.role
      });
    } catch (err) {
      console.warn("Failed to fetch profile, using metadata fallback:", err);
      setUser({
        email: authUser.email,
        fullName: authUser.user_metadata?.full_name || 'Staff Operator',
        role: authUser.user_metadata?.role || 'user'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear session on app mount / browser refresh
  useEffect(() => {
    supabase.auth.signOut().finally(() => {
      setUser(null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserProfile(session.user);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
      email: data.user.email,
      fullName: profile?.full_name || 'Staff Operator',
      role: profile?.role || 'user'
    };

    setUser(sessionData);
    return sessionData;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
