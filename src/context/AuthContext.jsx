import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function fetchProfileByUserId(userId, setProfile) {
  if (!userId) {
    setProfile(null);
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to load profile:', error.message);
  }

  setProfile(data ?? null);
  return data ?? null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initialiseSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        await fetchProfileByUserId(nextUser.id, setProfile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    initialiseSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;

      if (!isMounted) {
        return;
      }

      setUser(nextUser);

      setTimeout(() => {
        if (!isMounted) {
          return;
        }

        if (nextUser) {
          fetchProfileByUserId(nextUser.id, setProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password, name) => {
    if (!email || !password || !name) {
      throw new Error('Email, password, and name are required');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      throw error;
    }

    const nextUser = data?.user ?? null;
    setUser(nextUser);

    if (nextUser) {
      await fetchProfileByUserId(nextUser.id, setProfile);
    }

    return data;
  };

  const signIn = async (email, password) => {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw error;
    }

    const nextUser = data?.user ?? null;
    setUser(nextUser);

    if (nextUser) {
      await fetchProfileByUserId(nextUser.id, setProfile);
    }

    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    try {
      Object.keys(window.sessionStorage)
        .filter((k) => k.startsWith('civicchat:'))
        .forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(null);
  };

  const role = profile?.role ?? null;
  const value = useMemo(() => ({ user, profile, role, loading, signUp, signIn, signOut }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
