// Panel de alertas de stock (spec 05 §16.4 columna /dashboard; spec 02 F-6). Muestra lo que devuelve la API:
// la condición de alerta (RN-09) no se calcula en el cliente.
import { Alert, Button, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useLoaderData, useRevalidator } from 'react-router';
import type { Product } from '../api/products';
import type { AlertsLoaderData } from '../routes/loaders';

const columns: TableProps<Product>['columns'] = [
  { title: 'Nombre', dataIndex: 'name', key: 'name' },
  { title: 'Stock actual', dataIndex: 'currentStock', key: 'currentStock', align: 'right' },
  { title: 'Stock mínimo', dataIndex: 'minStockAlert', key: 'minStockAlert', align: 'right' },
];

export default function DashboardHomePage() {
  const data = useLoaderData() as AlertsLoaderData;
  const revalidator = useRevalidator();

  let body: React.ReactNode = null;
  if (data.status === 'error') {
    body = (
      <Alert
        type="error"
        showIcon
        message="No se pudieron cargar las alertas de stock."
        description="Inténtalo de nuevo en unos momentos."
        action={<Button onClick={() => void revalidator.revalidate()}>Reintentar</Button>}
      />
    );
  } else if (data.status === 'ready') {
    body = (
      <Table<Product>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={data.alerts}
        pagination={false}
        locale={{ emptyText: 'No hay productos en alerta de stock.' }}
      />
    );
  }

  return (
    <>
      <Typography.Title level={3}>Alertas de stock</Typography.Title>
      {body}
    </>
  );
}
