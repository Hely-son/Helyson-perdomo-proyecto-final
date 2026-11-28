import { Tag } from 'antd';
import type { OrderStatus } from '../api/orders';
import { STATUS_LABELS } from './orders';

const COLORS: Record<OrderStatus, string> = {
  PENDING: 'gold',
  PROCESSING: 'blue',
  DISPATCHED: 'purple',
  DELIVERED: 'green',
  CANCELLED: 'default',
};

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  return (
    <span data-order-status={status}>
      <Tag color={COLORS[status]}>{STATUS_LABELS[status] ?? status}</Tag>
    </span>
  );
}
