// Contenido del Drawer de detalle (spec 04 F-3, F-6). Muestra lo que devuelve la API, sin recalcular importes.
import { Alert, Button, Descriptions, Popconfirm, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { OrderItem, OrderTargetStatus } from '../api/orders';
import type { OrderDetailState } from '../routes/loaders';
import { ACTION_LABELS, availableOrderActions, formatOrderDate } from './orders';
import { OrderStatusTag } from './OrderStatusTag';

const ITEM_COLUMNS: TableProps<OrderItem>['columns'] = [
  { title: 'Producto', dataIndex: 'productName', key: 'productName' },
  { title: 'Cantidad', dataIndex: 'quantity', key: 'quantity', align: 'right' },
  { title: 'Precio', dataIndex: 'unitPrice', key: 'unitPrice', align: 'right' },
  { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right' },
];

export interface OrderDetailPanelProps {
  detail: OrderDetailState;
  /** true mientras se envía un cambio o se vuelve a leer: las acciones quedan inhabilitadas. */
  submitting: boolean;
  onChangeStatus: (target: OrderTargetStatus) => void;
  onRetry?: () => void;
  /** Mensaje de validación del último cambio: se muestra junto a las acciones (spec 05 §16.4). */
  actionError?: string | null;
}

export function OrderDetailPanel({ detail, submitting, onChangeStatus, onRetry, actionError }: OrderDetailPanelProps) {
  if (detail.status === 'not-found') return <Alert type="warning" showIcon message="El pedido no existe." />;
  if (detail.status === 'invalid') return <Alert type="warning" showIcon message={detail.message} />;
  if (detail.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="No se pudo cargar el pedido."
        description="Inténtalo de nuevo en unos momentos."
        action={onRetry && <Button onClick={onRetry}>Reintentar</Button>}
      />
    );
  }

  const { order } = detail;
  const actions = availableOrderActions(order.status);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'number', label: 'Número', children: order.orderNumber },
          { key: 'status', label: 'Estado', children: <OrderStatusTag status={order.status} /> },
          { key: 'date', label: 'Fecha', children: formatOrderDate(order.createdAt) },
          { key: 'customer', label: 'Cliente', children: order.customer.businessName },
          { key: 'taxId', label: 'RUT', children: order.customer.taxId },
          { key: 'phone', label: 'Teléfono', children: order.customer.phone },
        ]}
      />
      <Table<OrderItem>
        rowKey="productId"
        size="small"
        columns={ITEM_COLUMNS}
        dataSource={order.items}
        pagination={false}
        scroll={{ x: true }}
      />
      <Typography.Text strong>Total: {order.totalAmount}</Typography.Text>
      {actionError && <Alert type="warning" showIcon message={actionError} />}
      {actions.length === 0 ? (
        <Typography.Text type="secondary">Este pedido no admite más cambios.</Typography.Text>
      ) : (
        <Space wrap>
          {actions.map((target) =>
            target === 'CANCELLED' ? (
              <Popconfirm
                key={target}
                title="¿Cancelar el pedido?"
                description="La cancelación no se puede deshacer."
                okText="Sí, cancelar"
                cancelText="Volver"
                disabled={submitting}
                onConfirm={() => onChangeStatus(target)}
              >
                <Button danger disabled={submitting} data-order-action={target}>
                  {ACTION_LABELS[target]}
                </Button>
              </Popconfirm>
            ) : (
              <Button
                key={target}
                type="primary"
                disabled={submitting}
                data-order-action={target}
                onClick={() => onChangeStatus(target)}
              >
                {ACTION_LABELS[target]}
              </Button>
            ),
          )}
        </Space>
      )}
    </Space>
  );
}
