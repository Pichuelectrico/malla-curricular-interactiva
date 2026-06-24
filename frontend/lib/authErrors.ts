type AuthErrorLike = Error & { code?: string; status?: number };

export function authErrorMessage(error: AuthErrorLike): string {
  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    msg.includes('rate limit')
  ) {
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  }

  if (code === 'user_already_exists' || msg.includes('user already registered')) {
    return 'Este correo ya está registrado. Inicia sesión o usa "¿Olvidaste tu contraseña?".';
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.';
  }

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }

  if (
    code === 'redirect_uri_mismatch' ||
    msg.includes('redirect') ||
    msg.includes('redirect_to')
  ) {
    return 'Error de configuración al crear la cuenta. Contacta al administrador del sitio.';
  }

  if (msg.includes('password') && (msg.includes('short') || msg.includes('least'))) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }

  if (msg.includes('valid email') || code === 'validation_failed') {
    return 'Ingresa un correo válido.';
  }

  if (msg.includes('signup') && msg.includes('disabled')) {
    return 'El registro de nuevas cuentas está deshabilitado temporalmente.';
  }

  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to send')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
  }

  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'La solicitud tardó demasiado. Intenta de nuevo en unos segundos.';
  }

  if (msg.includes('already been registered') || msg.includes('already exists')) {
    return 'Este correo ya está registrado. Inicia sesión o usa "¿Olvidaste tu contraseña?".';
  }

  return 'Ocurrió un error. Intenta de nuevo.';
}
