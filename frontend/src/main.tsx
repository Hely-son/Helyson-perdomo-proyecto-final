import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { App as AntApp, ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import { router } from './routes/router';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('No se encontró el elemento #root.');

createRoot(rootElement).render(
  <StrictMode>
    <ConfigProvider locale={esES}>
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
