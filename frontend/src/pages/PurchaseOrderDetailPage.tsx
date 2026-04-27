import {
  Title,
  Group,
  Stack,
  Card,
  Text,
  Badge,
  Button,
  Table,
  Loader,
  Center,
  Modal,
  Grid,
  Anchor,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCheck, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  usePurchaseOrder,
  useConfirmPurchaseOrder,
  useCancelPurchaseOrder,
} from '../api/purchases';
import { formatCurrency, formatDate, formatNumber, statusColor } from '../utils/format';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = id ? Number(id) : undefined;

  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const confirmOrder = useConfirmPurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();

  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [cancelOpen, { open: openCancel, close: closeCancel }] = useDisclosure(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Center mih="50vh">
        <Loader />
      </Center>
    );
  }

  if (!order) {
    return (
      <Stack>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/purchases')}
          w="fit-content"
        >
          Back to purchase orders
        </Button>
        <Text c="red">Purchase order not found</Text>
      </Stack>
    );
  }

  const total = order.items.reduce(
    (sum, it) =>
      sum + parseFloat(it.quantity || '0') * parseFloat(it.unit_price || '0'),
    0
  );

  const handleConfirm = () => {
    if (!orderId) return;
    setActionError(null);
    confirmOrder.mutate(orderId, {
      onSuccess: () => {
        notifications.show({
          title: 'Order confirmed',
          message: `Stock has been added for order #${orderId}`,
          color: 'green',
        });
        closeConfirm();
      },
      onError: (err: any) => {
        const msg =
          err?.response?.data?.detail ||
          JSON.stringify(err?.response?.data || {}) ||
          'Could not confirm order';
        setActionError(msg);
        notifications.show({
          title: 'Confirmation failed',
          message: msg,
          color: 'red',
        });
      },
    });
  };

  const handleCancel = () => {
    if (!orderId) return;
    cancelOrder.mutate(orderId, {
      onSuccess: () => {
        notifications.show({
          title: 'Order cancelled',
          message: `Order #${orderId} cancelled`,
          color: 'green',
        });
        closeCancel();
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Could not cancel',
          message: err?.response?.data?.detail || 'Unexpected error',
          color: 'red',
        });
      },
    });
  };

  const isDraft = order.status === 'draft';

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => navigate('/purchases')}
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>Purchase Order #{order.id}</Title>
          <Badge color={statusColor[order.status]} variant="light" size="lg">
            {order.status}
          </Badge>
        </Group>
        {isDraft && (
          <Group>
            <Button
              variant="default"
              color="red"
              leftSection={<IconX size={16} />}
              onClick={openCancel}
            >
              Cancel
            </Button>
            <Button
              color="green"
              leftSection={<IconCheck size={16} />}
              onClick={openConfirm}
            >
              Confirm
            </Button>
          </Group>
        )}
      </Group>

      <Card withBorder padding="lg" radius="md">
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Supplier
            </Text>
            <Text fw={500}>{order.supplier}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Created
            </Text>
            <Text fw={500}>{formatDate(order.created_at)}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Items
            </Text>
            <Text fw={500}>{order.items.length}</Text>
          </Grid.Col>
          {order.notes && (
            <Grid.Col span={12}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Notes
              </Text>
              <Text>{order.notes}</Text>
            </Grid.Col>
          )}
        </Grid>
      </Card>

      <Card withBorder padding={0} radius="md">
        <Table.ScrollContainer minWidth={600}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Product</Table.Th>
                <Table.Th>Quantity</Table.Th>
                <Table.Th>Unit price</Table.Th>
                <Table.Th>Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {order.items.map((item) => (
                <Table.Tr key={item.id ?? `${item.product}-${item.quantity}`}>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/products/${item.product}`)}>
                      {item.product_name ?? `Product #${item.product}`}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{formatNumber(item.quantity, 2)}</Table.Td>
                  <Table.Td>{formatCurrency(item.unit_price)}</Table.Td>
                  <Table.Td>
                    {formatCurrency(
                      item.total_price ??
                        parseFloat(item.quantity) * parseFloat(item.unit_price)
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={3} ta="right">
                  Total cost
                </Table.Th>
                <Table.Th>
                  <Text fw={700}>{formatCurrency(total)}</Text>
                </Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title="Confirm purchase order"
        centered
      >
        <Stack>
          <Text>
            Confirming this order will add {order.items.length} stock
            {order.items.length === 1 ? ' entry' : ' entries'} for{' '}
            {formatCurrency(total)}. This cannot be undone.
          </Text>
          {actionError && <Text c="red">{actionError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              color="green"
              onClick={handleConfirm}
              loading={confirmOrder.isPending}
            >
              Confirm order
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={cancelOpen}
        onClose={closeCancel}
        title="Cancel purchase order"
        centered
      >
        <Stack>
          <Text>Are you sure you want to cancel this order?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeCancel}>
              Keep
            </Button>
            <Button
              color="red"
              onClick={handleCancel}
              loading={cancelOrder.isPending}
            >
              Cancel order
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
