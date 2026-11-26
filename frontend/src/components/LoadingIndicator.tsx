import { Spin } from 'antd';

/** Indicador de carga de pantalla completa de contenido (spec 05 §16.4 "Cargando"). */
export default function LoadingIndicator() {
  return <Spin spinning tip="Cargando..." style={{ display: 'block', padding: 48 }}><div style={{ minHeight: 80 }} /></Spin>;
}
