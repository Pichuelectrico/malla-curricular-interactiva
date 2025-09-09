import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AuthBar() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, sess: Session | null) => {
      setUserEmail(sess?.user?.email ?? null);
    });
    return () => sub.subscription?.unsubscribe();
  }, []);

  const signInWithMagicLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      alert('Revisa tu correo para el enlace de acceso.');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="w-full border-b bg-white/70 dark:bg-gray-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-900/60">
      <div className="container mx-auto p-3 flex flex-wrap gap-2 items-center justify-between">
        <div className="text-sm">{userEmail ? `Sesión: ${userEmail}` : 'No autenticado'}</div>
        {userEmail ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={signOut}>Cerrar sesión</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-64"
            />
            <Button onClick={signInWithMagicLink} disabled={loading || !email}>Magic Link</Button>
            <Button variant="outline" onClick={signInWithGoogle} disabled={loading}>Google</Button>
            {error && <span className="text-xs text-red-500 ml-2">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
