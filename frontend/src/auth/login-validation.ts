// Validación local del formulario de login (spec 05 §16.3; solo formato básico).
export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginErrors {
  email?: string;
  password?: string;
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginInput({ email, password }: LoginInput): LoginErrors {
  const errors: LoginErrors = {};
  const trimmed = email.trim();
  if (trimmed === '') errors.email = 'Ingresa tu email.';
  else if (!EMAIL_FORMAT.test(trimmed)) errors.email = 'Ingresa un email con formato válido.';
  if (password === '') errors.password = 'Ingresa tu contraseña.';
  return errors;
}
