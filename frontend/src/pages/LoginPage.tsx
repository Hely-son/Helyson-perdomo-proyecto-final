import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useLoaderData, useNavigate } from 'react-router';
import { ApiError, apiRequest } from '../api/client';
import { validateLoginInput } from '../auth/login-validation';
import { sessionStore } from '../auth/session-store';
import type { LoginLoaderData } from '../routes/loaders';

interface LoginFormValues {
  email?: string;
  password?: string;
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  operator: { name: string };
}

/** Mensaje por `code` (spec 05 §16.3, §16.5); nunca se muestra el `message` del servidor. */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Email o contraseña incorrectos.';
    if (error.code === 'VALIDATION_ERROR' || error.code === 'MALFORMED_REQUEST') {
      return 'Revisa el email y la contraseña ingresados.';
    }
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo más tarde.';
}

export default function LoginPage() {
  const { sessionExpired } = useLoaderData<LoginLoaderData>();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateField = (field: 'email' | 'password') => (_: unknown, value: string | undefined) => {
    const input = { email: '', password: '' };
    input[field] = value ?? '';
    const message = validateLoginInput(input)[field];
    return message === undefined ? Promise.resolve() : Promise.reject(new Error(message));
  };

  const handleFinish = async ({ email = '', password = '' }: LoginFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      sessionStore.setSession({
        token: response.token,
        expiresAt: response.expiresAt,
        operatorName: response.operator.name,
      });
      void navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(loginErrorMessage(cause));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3}>Iniciar sesión</Typography.Title>
        {sessionExpired && (
          <Alert type="warning" showIcon message="Tu sesión expiró. Inicia sesión de nuevo." style={{ marginBottom: 16 }} />
        )}
        {error !== null && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form<LoginFormValues> layout="vertical" disabled={submitting} onFinish={handleFinish} noValidate>
          <Form.Item label="Email" name="email" rules={[{ validator: validateField('email') }]}>
            <Input type="email" autoComplete="username" />
          </Form.Item>
          <Form.Item label="Contraseña" name="password" rules={[{ validator: validateField('password') }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Iniciar sesión
          </Button>
        </Form>
      </Card>
    </div>
  );
}
