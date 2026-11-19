import { Navigate } from 'react-router';
import { FALLBACK_PATH } from './routes';

/** '/' y cualquier ruta desconocida redirigen al inicio del dashboard, sin pantalla 404. */
export default function FallbackRedirect() {
  return <Navigate to={FALLBACK_PATH} replace />;
}
