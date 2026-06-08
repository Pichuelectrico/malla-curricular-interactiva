import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'new-password';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: AuthMode;
}

const titles: Record<AuthMode, string> = {
  login: 'Iniciar sesión',
  signup: 'Crear cuenta',
  forgot: 'Recuperar contraseña',
  'new-password': 'Nueva contraseña',
};

const descriptions: Record<AuthMode, string> = {
  login: 'Ingresa con tu correo y contraseña para guardar tu progreso.',
  signup: 'Crea una cuenta para sincronizar tu malla en la nube.',
  forgot: 'Te enviaremos un enlace a tu correo para restablecer tu contraseña.',
  'new-password': 'Elige una nueva contraseña para tu cuenta.',
};

function authErrorMessage(error: Error): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('user already registered')) return 'Este correo ya está registrado.';
  if (msg.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('valid email')) return 'Ingresa un correo válido.';
  return 'Ocurrió un error. Intenta de nuevo.';
}

export default function AuthModal({ open, onOpenChange, initialMode = 'login' }: AuthModalProps) {
  const { signInWithPassword, signUp, resetPassword, clearPasswordRecovery } = useSupabaseAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetForm();
      clearPasswordRecovery();
    }
    onOpenChange(next);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
  };

  React.useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    }

    if (mode !== 'forgot' && mode !== 'new-password' && !password) return;
    if (mode === 'new-password' && !password) return;

    setLoading(true);

    if (mode === 'new-password') {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        setLoading(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (updateError) {
        setError(authErrorMessage(updateError));
      } else {
        setSuccess('Contraseña actualizada correctamente.');
        setTimeout(() => handleOpenChange(false), 1500);
      }
      return;
    }

    if (mode === 'login') {
      const { error: signInError } = await signInWithPassword(trimmedEmail, password);
      setLoading(false);
      if (signInError) {
        setError(authErrorMessage(signInError));
      } else {
        handleOpenChange(false);
      }
      return;
    }

    if (mode === 'signup') {
      const { error: signUpError, needsConfirmation } = await signUp(trimmedEmail, password);
      setLoading(false);
      if (signUpError) {
        setError(authErrorMessage(signUpError));
      } else if (needsConfirmation) {
        setSuccess('Revisa tu correo para confirmar tu cuenta.');
      } else {
        handleOpenChange(false);
      }
      return;
    }

    const { error: resetError } = await resetPassword(trimmedEmail);
    setLoading(false);
    if (resetError) {
      setError(authErrorMessage(resetError));
    } else {
      setSuccess('Revisa tu correo para restablecer tu contraseña.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'new-password' && (
            <div className="space-y-2">
              <Label htmlFor="auth-email">Correo electrónico</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="space-y-2">
              <Label htmlFor="auth-password">
                {mode === 'new-password' ? 'Nueva contraseña' : 'Contraseña'}
              </Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === 'signup' || mode === 'new-password' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {(mode === 'signup' || mode === 'new-password') && (
            <div className="space-y-2">
              <Label htmlFor="auth-confirm-password">Confirmar contraseña</Label>
              <Input
                id="auth-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !!success}>
            {loading
              ? '...'
              : mode === 'login'
                ? 'Iniciar sesión'
                : mode === 'signup'
                  ? 'Crear cuenta'
                  : mode === 'new-password'
                    ? 'Guardar contraseña'
                    : 'Enviar enlace'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground space-y-2">
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
              <p>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-primary hover:underline font-medium"
                >
                  Crear cuenta
                </button>
              </p>
            </>
          )}

          {mode === 'signup' && (
            <p>
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-primary hover:underline font-medium"
              >
                Iniciar sesión
              </button>
            </p>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-primary hover:underline"
            >
              Volver a iniciar sesión
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
