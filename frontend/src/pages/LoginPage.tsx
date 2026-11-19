import { Card, Typography } from 'antd';

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3}>Iniciar sesión</Typography.Title>
        <Typography.Paragraph type="secondary">Pantalla en construcción.</Typography.Paragraph>
      </Card>
    </div>
  );
}
