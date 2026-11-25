import { Navigate, useLoaderData } from 'react-router';

/** '/' y cualquier ruta desconocida: /dashboard con sesión válida, /login sin ella (DP-07). Sin pantalla 404. */
export default function FallbackRedirect() {
  const to = useLoaderData<string>();
  return <Navigate to={to} replace />;
}
