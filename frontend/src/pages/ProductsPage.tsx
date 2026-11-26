// Productos y ajuste de stock (spec 05 §16.4, §16.5; spec 02 F-1..F-5, DP-01/02/04). Muestra lo que devuelve la API:
// el resaltado cruza ids con listStockAlerts (DP-04) y no se calcula ninguna regla RN- en el cliente.
import { useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useLoaderData, useRevalidator } from 'react-router';
import {
  adjustProductStock,
  createProduct,
  deactivateProduct,
  updateProduct,
  type CreateProductRequest,
  type Product,
  type UpdateProductRequest,
} from '../api/products';
import { buildAdjustStockRequest, criticalProductIds, runProductAction } from '../products/inventory';
import type { ProductsLoaderData } from '../routes/loaders';

type FormState = { kind: 'create' } | { kind: 'edit'; product: Product } | { kind: 'adjust'; product: Product };


interface ProductFormValues {
  name?: string;
  description?: string;
  price?: string;
  currentStock?: number;
  minStockAlert?: number;
  newStock?: number;
}

export default function ProductsPage() {
  const data = useLoaderData() as ProductsLoaderData;
  const revalidator = useRevalidator();
  const { message } = App.useApp();
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const products = data.status === 'ready' ? data.products : null;
  const alerts = data.status === 'ready' ? data.alerts : null;
  const critical = useMemo(() => criticalProductIds(products ?? [], alerts), [products, alerts]);

  // Recarga productos y alertas: revalida el loader de la ruta.
  const reloadLists = () => void revalidator.revalidate();

  const closeForm = () => {
    setFormState(null);
    setFormError(null);
  };

  /** Ejecuta una operación; devuelve true si se completó. Los errores se muestran según su clasificación. */
  async function perform<T>(action: () => Promise<T>, successText: string, inForm: boolean): Promise<boolean> {
    setSubmitting(true);
    const result = await runProductAction(action, reloadLists);
    setSubmitting(false);
    if (result.ok) {
      if (inForm) closeForm();
      void message.success(successText);
      return true;
    }
    const { error } = result;
    if (error.kind === 'session') return false; // el flujo de sesión ya redirige a /login
    if (error.kind === 'conflict' || error.kind === 'not-found') {
      if (inForm) closeForm();
      void message.warning(error.message);
    } else if (inForm) {
      setFormError(error.message); // validation y technical: dentro del formulario, sin perder los datos
    } else {
      void message.error(error.message);
    }
    return false;
  }

  const submitForm = (state: FormState, values: ProductFormValues): Promise<boolean> => {
    if (state.kind === 'create') {
      const body: CreateProductRequest = {
        name: values.name ?? '',
        price: values.price ?? '',
        currentStock: values.currentStock ?? 0,
        minStockAlert: values.minStockAlert ?? 0,
        ...(values.description ? { description: values.description } : {}),
      };
      return perform(() => createProduct(body), 'Producto creado.', true);
    }
    if (state.kind === 'edit') {
      const { product } = state;
      const body: UpdateProductRequest = {};
      if (values.name !== undefined && values.name !== product.name) body.name = values.name;
      if ((values.description ?? '') !== (product.description ?? '')) body.description = values.description || null;
      if (values.price !== undefined && values.price !== product.price) body.price = values.price;
      if (values.minStockAlert !== undefined && values.minStockAlert !== product.minStockAlert) {
        body.minStockAlert = values.minStockAlert;
      }
      if (Object.keys(body).length === 0) {
        closeForm();
        return Promise.resolve(true);
      }
      return perform(() => updateProduct(product.id, body), 'Producto actualizado.', true);
    }
    const request = buildAdjustStockRequest(state.product, values.newStock ?? 0);
    return perform(() => adjustProductStock(state.product.id, request), 'Stock actualizado.', true);
  };

  const columns: TableProps<Product>['columns'] = [
    { title: 'Nombre', dataIndex: 'name', key: 'name' },
    { title: 'Precio', dataIndex: 'price', key: 'price', align: 'right' },
    { title: 'Stock', dataIndex: 'currentStock', key: 'currentStock', align: 'right' },
    { title: 'Mínimo', dataIndex: 'minStockAlert', key: 'minStockAlert', align: 'right' },
    {
      title: 'Estado',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (isActive ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag>),
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, product) => (
        <Space size="small">
          <Button size="small" onClick={() => setFormState({ kind: 'edit', product })}>
            Editar
          </Button>
          <Button size="small" onClick={() => setFormState({ kind: 'adjust', product })}>
            Ajustar stock
          </Button>
          {product.isActive && (
            <Popconfirm
              title="¿Desactivar el producto?"
              okText="Desactivar"
              cancelText="Cancelar"
              onConfirm={() => perform(() => deactivateProduct(product.id), 'Producto desactivado.', false)}
            >
              <Button size="small" danger>
                Desactivar
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  let body: React.ReactNode = null;
  if (data.status === 'error') {
    body = (
      <Alert
        type="error"
        showIcon
        message="No se pudo cargar el catálogo."
        description="Inténtalo de nuevo en unos momentos."
        action={<Button onClick={reloadLists}>Reintentar</Button>}
      />
    );
  } else if (data.status === 'ready') {
    body = (
      <>
        {data.alerts === null && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="El resaltado de stock crítico no está disponible en este momento."
          />
        )}
        <Table<Product>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={data.products}
          pagination={false}
          rowClassName={(product) => (critical.has(product.id) ? 'is-stock-critical' : '')}
          locale={{ emptyText: 'El catálogo está vacío. No hay productos registrados.' }}
        />
      </>
    );
  }

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Productos
        </Typography.Title>
        {data.status === 'ready' && (
          <Button type="primary" onClick={() => setFormState({ kind: 'create' })}>
            Nuevo producto
          </Button>
        )}
      </Space>
      <style>{'.ant-table-row.is-stock-critical > .ant-table-cell { background: #fff1f0; }'}</style>
      {body}
      {formState !== null && (
        <ProductFormModal
          key={formState.kind === 'create' ? 'create' : `${formState.kind}-${formState.product.id}`}
          state={formState}
          error={formError}
          submitting={submitting}
          onCancel={closeForm}
          onSubmit={(values) => submitForm(formState, values)}
        />
      )}
    </>
  );
}

interface ProductFormModalProps {
  state: FormState;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductFormValues) => Promise<boolean>;
}

function ProductFormModal({ state, error, submitting, onCancel, onSubmit }: ProductFormModalProps) {
  const [form] = Form.useForm<ProductFormValues>();
  const product = state.kind === 'create' ? null : state.product;
  const titles = { create: 'Nuevo producto', edit: 'Editar producto', adjust: 'Ajustar stock' };
  const okTexts = { create: 'Crear', edit: 'Guardar', adjust: 'Ajustar' };

  const initialValues: ProductFormValues =
    state.kind === 'edit'
      ? {
          name: state.product.name,
          description: state.product.description ?? '',
          price: state.product.price,
          minStockAlert: state.product.minStockAlert,
        }
      : state.kind === 'adjust'
        ? { newStock: state.product.currentStock }
        : {};

  return (
    <Modal
      open
      title={titles[state.kind]}
      okText={okTexts[state.kind]}
      cancelText="Cancelar"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      onCancel={onCancel}
      maskClosable={false}
    >
      <Form<ProductFormValues> form={form} layout="vertical" initialValues={initialValues} onFinish={(v) => void onSubmit(v)}>
        {error !== null && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} />}
        {state.kind === 'adjust' && product !== null && (
          <>
            <Typography.Paragraph>
              {product.name} · stock actual: {product.currentStock}
            </Typography.Paragraph>
            <Form.Item name="newStock" label="Nuevo stock" rules={[{ required: true, message: 'Indica el nuevo stock.' }]}>
              <InputNumber precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}
        {state.kind !== 'adjust' && (
          <>
            <Form.Item name="name" label="Nombre" rules={[{ required: true, whitespace: true, message: 'Indica el nombre.' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Descripción">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="price" label="Precio" rules={[{ required: true, message: 'Indica el precio.' }]}>
              <Input inputMode="decimal" placeholder="1250.00" />
            </Form.Item>
            {state.kind === 'create' && (
              <Form.Item name="currentStock" label="Stock inicial" rules={[{ required: true, message: 'Indica el stock.' }]}>
                <InputNumber precision={0} style={{ width: '100%' }} />
              </Form.Item>
            )}
            <Form.Item name="minStockAlert" label="Stock mínimo" rules={[{ required: true, message: 'Indica el mínimo.' }]}>
              <InputNumber precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
