import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { queryClientInstance } from '@/lib/query-client';

/**
 * @typedef {Object} AuthContextValue
 * @property {import('@supabase/supabase-js').Session | null} session
 * @property {import('@supabase/supabase-js').User | null} user
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoadingAuth true until the stored session (or a code in the URL) has been resolved
 * @property {() => Promise<void>} signOut
 */

/** @type {React.Context<AuthContextValue | null>} */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    // getSession waits for the client to finish initialising, which includes
    // exchanging a PKCE ?code= from an OAuth, magic link or recovery redirect.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoadingAuth(false);
    });

    // Keep this callback synchronous: awaiting other Supabase calls inside it can deadlock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT') queryClientInstance.clear();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: !!session,
      isLoadingAuth,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoadingAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @returns {AuthContextValue} */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
