import { AppShell, Burger, Group, NavLink, Text, Button, Avatar } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDashboard,
  IconPackage,
  IconShoppingCart,
  IconReceipt,
  IconLogout,
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { label: 'Dashboard', icon: IconDashboard, path: '/' },
  { label: 'Products', icon: IconPackage, path: '/products' },
  { label: 'Purchase Orders', icon: IconShoppingCart, path: '/purchases' },
  { label: 'Sales Orders', icon: IconReceipt, path: '/sales' },
];

function isActive(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="lg" fw={700}>
              Inventory Manager
            </Text>
          </Group>
          <Group gap="sm">
            <Avatar radius="xl" size="sm" color="blue">
              {user?.username?.[0]?.toUpperCase()}
            </Avatar>
            <Text size="sm" visibleFrom="xs">
              {user?.username}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconLogout size={16} />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            label={item.label}
            leftSection={<item.icon size={20} />}
            active={isActive(location.pathname, item.path)}
            onClick={() => {
              navigate(item.path);
              close();
            }}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
