import {
  Title,
  Button,
  Group,
  Table,
  Stack,
  Badge,
  Card,
  Text,
  Loader,
  Center,
  Pagination,
  Anchor,
} from '@mantine/core';
import { IconPlus, IconReceiptOff } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSalesOrders } from '../api/sales';
import { formatCurrency, formatDate, statusColor } from '../utils/format';

function calcTotal(items: { quantity: string; unit_price: string }[]): number {
  return items.reduce(
    (sum, it) => sum + parseFloat(it.quantity || '0') * parseFloat(it.unit_price || '0'),
    0
  );
}

export default function SalesOrdersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useSalesOrders(page);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    const pageSize = data.results.length || 20;
    return Math.max(1, Math.ceil(data.count / pageSize));
  }, [data]);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Sales Orders</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => navigate('/sales/new')}
        >
          New Sales Order
        </Button>
      </Group>

      <Card withBorder padding={0} radius="md">
        {isLoading ? (
          <Center p="xl">
            <Loader />
          </Center>
        ) : isError ? (
          <Center p="xl">
            <Text c="red">Failed to load sales orders</Text>
          </Center>
        ) : !data || data.results.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <IconReceiptOff size={40} color="gray" />
              <Text c="dimmed">No sales orders yet</Text>
              <Button variant="light" onClick={() => navigate('/sales/new')}>
                Create your first order
              </Button>
            </Stack>
          </Center>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table striped horizontalSpacing="md" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Items</Table.Th>
                  <Table.Th>Revenue</Table.Th>
                  <Table.Th>Date</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.results.map((order) => (
                  <Table.Tr key={order.id}>
                    <Table.Td>
                      <Anchor onClick={() => navigate(`/sales/${order.id}`)}>
                        #{order.id}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{order.customer}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor[order.status]} variant="light">
                        {order.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{order.items?.length ?? 0}</Table.Td>
                    <Table.Td>
                      {formatCurrency(calcTotal(order.items ?? []))}
                    </Table.Td>
                    <Table.Td>{formatDate(order.created_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {data && totalPages > 1 && (
        <Group justify="center">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}
    </Stack>
  );
}
