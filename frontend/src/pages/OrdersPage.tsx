// Pedidos del operador (spec 05 §16.4, §16.5; spec 04 F-3..F-6, PE-01, PE-02, DP-02). Filtro, página y pedido
// abierto viven en la URL y los lee ordersLoader. Las transiciones (RN-05) las decide el backend.
import { useState } from 'react';
import { Alert, App, Button, Drawer, Empty, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useLoaderData, useNavigate, useNavigation, useRevalidator } from 'react-router';
import { changeOrderStatus, type OrderStatus, type OrderSummary, type OrderTargetStatus } from '../api/orders';
import { OrderDetailPanel } from '../orders/OrderDetailPanel';
import { OrderStatusTag } from '../orders/OrderStatusTag';
import { STATUS_LABELS, formatOrderDate, ordersSearch, runOrderAction, withStatusFilter, type OrdersQuery } from '../orders/orders';
import type { OrdersLoaderData } from '../routes/loaders';

const ALL = 'ALL';
const FILTER_OPTIONS = [
  { value: ALL, label: 'Todos los estados' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function OrdersPage() {
  const data = useLoaderData() as OrdersLoaderData;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<{ orderId: number; message: string } | null>(null);

  const title = <Typography.Title level={3}>Pedidos</Typography.Title>;
  if (data.status === 'session') return title; // el flujo de sesión ya redirige a /login

  const { query, detail } = data;
  const reload = () => void revalidator.revalidate();
  const goTo = (next: OrdersQuery) => void navigate(`/dashboard/orders${ordersSearch(next)}`);
  const closeDetail = () => {
    setValidation(null);
    goTo({ ...query, orderId: null });
  };
  // También mientras se vuelve a leer: el detalle visible puede estar obsoleto.
  const busy = submitting || revalidator.state !== 'idle' || navigation.state !== 'idle';

  const changeStatus = async (orderId: number, target: OrderTargetStatus) => {
    setSubmitting(true);
    setValidation(null);
    const result = await runOrderAction(() => changeOrderStatus(orderId, target), reload);
    setSubmitting(false);
    if (result.ok) {
      void message.success('Pedido actualizado.');
      return;
    }
    const { error } = result;
    if (error.kind === 'session') return; // el flujo de sesión ya redirige a /login
    if (error.kind === 'validation') setValidation({ orderId, message: error.message });
    else if (error.kind === 'technical') void message.error(error.message);
    else void message.warning(error.message);
  };

  const columns: TableProps<OrderSummary>['columns'] = [
    { title: 'Pedido', dataIndex: 'orderNumber', key: 'orderNumber' },
    { title: 'Cliente', key: 'customer', render: (_, order) => order.customer.businessName },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (status: OrderStatus) => <OrderStatusTag status={status} />,
    },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', align: 'right' },
    { title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', render: (iso: string) => formatOrderDate(iso) },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, order) => (
        <Button size="small" onClick={() => goTo({ ...query, orderId: order.id })}>
          Ver detalle
        </Button>
      ),
    },
  ];

  let body: React.ReactNode;
  if (data.status === 'error') {
    body = (
      <Alert
        type="error"
        showIcon
        message="No se pudieron cargar los pedidos."
        description="Inténtalo de nuevo en unos momentos."
        action={<Button onClick={reload}>Reintentar</Button>}
      />
    );
  } else if (data.status === 'invalid') {
    body = (
      <Alert
        type="warning"
        showIcon
        message={data.message}
        action={<Button onClick={() => goTo(withStatusFilter(query, null))}>Quitar filtros</Button>}
      />
    );
  } else {
    const { items, pagination } = data.orders;
    // Fuera de rango, la paginación de antd marca la última página y su clic no navega: se ofrece volver a la primera.
    const emptyText = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={query.status === null ? 'No hay pedidos.' : 'No se encontraron pedidos con ese estado.'}
      >
        {query.page > 1 && <Button onClick={() => goTo({ ...query, page: 1, orderId: null })}>Ir a la primera página</Button>}
      </Empty>
    );
    body = (
      <Table<OrderSummary>
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={items}
        scroll={{ x: true }}
        locale={{ emptyText }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.totalItems,
          showSizeChanger: false,
          onChange: (page) => goTo({ ...query, page, orderId: null }),
        }}
      />
    );
  }

  return (
    <>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        {title}
        <Select
          aria-label="Filtrar por estado"
          style={{ width: 220 }}
          value={query.status ?? ALL}
          options={FILTER_OPTIONS}
          onChange={(value) => goTo(withStatusFilter(query, value === ALL ? null : (value as OrderStatus)))}
        />
      </Space>
      {body}
      <Drawer open={detail !== null} title="Detalle del pedido" width="min(640px, 100vw)" onClose={closeDetail}>
        {detail !== null && (
          <OrderDetailPanel
            detail={detail}
            submitting={busy}
            onChangeStatus={(target) => {
              if (detail.status === 'ready') void changeStatus(detail.order.id, target);
            }}
            onRetry={reload}
            actionError={detail.status === 'ready' && validation?.orderId === detail.order.id ? validation.message : null}
          />
        )}
      </Drawer>
    </>
  );
}
