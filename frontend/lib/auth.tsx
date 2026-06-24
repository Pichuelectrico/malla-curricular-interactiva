import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { cleanAuthHashFromUrl, getPasswordResetRedirectUrl, hasAuthCallbackHash } from './authRedirect';
import { supabase } from './supabaseClient';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isSignedIn: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'PASSWORD_RECOVERY'
      ) {
        cleanAuthHashFromUrl();
      }
      if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') {
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (hasAuthCallbackHash()) {
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
          setIsPasswordRecovery(true);
        }
      } else {
        cleanAuthHashFromUrl();
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const signInWithPassword = async (email: string, password: string): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string): Promise<{ error: Error | null }> => {
    const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
      'auth-signup',
      { body: { email, password } },
    );

    if (data?.error) {
      return { error: new Error(data.error) };
    }

    if (!error && data?.success) {
      return { error: null };
    }

    if (error) {
      const ctx = (error as Error & { context?: Response }).context;
      if (ctx) {
        try {
          const body = await ctx.json() as { error?: string };
          if (body.error) return { error: new Error(body.error) };
        } catch {
          // ignore JSON parse errors
        }
      }
      return { error: error as Error };
    }

    return { error: new Error('No se pudo crear la cuenta') };
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isSignedIn: !!session,
        isLoading,
        isPasswordRecovery,
        clearPasswordRecovery,
        signInWithPassword,
        signUp,
        resetPassword,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSupabaseAuth must be used inside <AuthProvider>');
  return ctx;
}
