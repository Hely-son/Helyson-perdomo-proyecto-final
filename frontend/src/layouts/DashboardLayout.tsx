import { Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { DASHBOARD_MENU_ITEMS, dashboardPathFromMenuKey, selectedMenuKey } from '../routes/menu';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selected = selectedMenuKey(pathname);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const target = dashboardPathFromMenuKey(key);
    if (target !== null) navigate(target);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light" width={220}>
        <div style={{ padding: '16px 24px' }}>
          <Typography.Text strong>MedSupply AI</Typography.Text>
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
