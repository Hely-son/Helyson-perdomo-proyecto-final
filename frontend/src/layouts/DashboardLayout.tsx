import { Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useSession } from '../auth/use-session';
import { sessionStore } from '../auth/session-store';
import { DASHBOARD_MENU_ITEMS, dashboardPathFromMenuKey, selectedMenuKey } from '../routes/menu';
import { LOGOUT_MENU_KEY } from '../routes/routes';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const session = useSession();
  const selected = selectedMenuKey(pathname);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === LOGOUT_MENU_KEY) {
      // Cierre local, sin endpoint (spec 05 §15.8).
      void navigate('/login', { replace: true });
      sessionStore.clearSession('logout');
      return;
    }
    const target = dashboardPathFromMenuKey(key);
    if (target !== null) void navigate(target);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light" width={220}>
        <div style={{ padding: '16px 24px' }}>
          <Typography.Text strong>MedSupply AI</Typography.Text>
          {session !== null && (
            <div>
              <Typography.Text type="secondary">{session.operatorName}</Typography.Text>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          items={DASHBOARD_MENU_ITEMS}
          selectedKeys={selected === null ? [] : [selected]}
          onClick={handleMenuClick}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Content style={{ margin: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
