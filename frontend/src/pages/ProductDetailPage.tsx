import {
  Title,
  Group,
  Card,
  Tabs,
  Stack,
  Text,
  Badge,
  Button,
  Table,
  Loader,
  Center,
  Modal,
  NumberInput,
  Grid,
  Anchor,
  ActionIcon,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBox,
  IconCoin,
  IconShoppingCart,
  IconReceipt,
  IconPlus,
  IconPencil,
  IconBoxOff,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useParams, useNavigate } from 'react-router-dom';
import { useProduct } from '../api/products';
import { useStocks, useCreateStock } from '../api/stocks';
import { useProductFinancial } from '../api/finance';
import { usePurchaseOrders } from '../api/purchases';
import { useSalesOrders } from '../api/sales';
import { formatCurrency, formatNumber, formatDate, statusColor } from '../utils/format';
import ProductFormModal from '../components/ProductFormModal';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const productId = id ? Number(id) : undefined;

  const { data: product, isLoading: productLoading } = useProduct(productId);
  const { data: stocks, isLoading: stocksLoading } = useStocks(productId);
  const { data: financial, isLoading: financialLoading } = useProductFinancial(productId);
  const { data: purchases } = usePurchaseOrders(1);
  const { data: sales } = useSalesOrders(1);

  const [stockOpen, { open: openStock, close: closeStock }] = useDisclosure(false);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const createStock = useCreateStock();

  const stockForm = useForm({
    initialValues: { quantity: 0 as number | string, unit_cost: 0 as number | string },
    validate: {
      quantity: (v) => (Number(v) > 0 ? null : 'Quantity must be greater than zero'),
      unit_cost: (v) => (Number(v) >= 0 ? null : 'Unit cost must be non-negative'),
    },
  });

  if (productLoading) {
    return (
      <Center mih="50vh">
        <Loader />
      </Center>
    );
  }

  if (!product) {
    return (
      <Stack>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/products')}
          w="fit-content"
        >
          Back to products
        </Button>
        <Text c="red">Product not found</Text>
      </Stack>
    );
  }

  const handleAddStock = (values: typeof stockForm.values) => {
    if (!productId) return;
    createStock.mutate(
      {
        product: productId,
        quantity: String(values.quantity),
        unit_cost: String(values.unit_cost),
      },
      {
        onSuccess: () => {
          notifications.show({
            title: 'Stock added',
            message: 'Manual stock entry saved',
            color: 'green',
          });
          stockForm.reset();
          closeStock();
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Could not add stock',
            message:
              err?.response?.data?.detail || 'Unexpected error',
            color: 'red',
          });
        },
      }
    );
  };

  const purchaseHistory = (purchases?.results ?? [])
    .flatMap((order) =>
      (order.items ?? [])
        .filter((it) => it.product === productId)
        .map((it) => ({ order, item: it }))
    );

  const salesHistory = (sales?.results ?? [])
    .flatMap((order) =>
      (order.items ?? [])
        .filter((it) => it.product === productId)
        .map((it) => ({ order, item: it }))
    );

  const totalStock = (stocks ?? []).reduce(
    (sum, s) => sum + parseFloat(s.available_quantity || '0'),
    0
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => navigate('/products')}
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>{product.name}</Title>
          <Badge variant="light">{product.unit_type}</Badge>
        </Group>
        <Button
          variant="default"
          leftSection={<IconPencil size={16} />}
          onClick={openEdit}
        >
          Edit
        </Button>
      </Group>

      <Card withBorder padding="lg" radius="md">
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              SKU
            </Text>
            <Text fw={500} ff="monospace">
              {product.sku}
            </Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Unit
            </Text>
            <Text fw={500}>{product.unit_type}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Current stock
            </Text>
            <Text fw={500}>
              {formatNumber(totalStock, 2)} {product.unit_type}
            </Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed" tt="uppercase">
              Created
            </Text>
            <Text fw={500}>{formatDate(product.created_at)}</Text>
          </Grid.Col>
          {product.description && (
            <Grid.Col span={12}>
              <Text size="xs" c="dimmed" tt="uppercase">
                Description
              </Text>
              <Text>{product.description}</Text>
            </Grid.Col>
          )}
        </Grid>
      </Card>

      <Tabs defaultValue="stock">
        <Tabs.List>
          <Tabs.Tab value="stock" leftSection={<IconBox size={16} />}>
            Stock
          </Tabs.Tab>
          <Tabs.Tab value="financial" leftSection={<IconCoin size={16} />}>
            Financial
          </Tabs.Tab>
          <Tabs.Tab value="purchases" leftSection={<IconShoppingCart size={16} />}>
            Purchase History
          </Tabs.Tab>
          <Tabs.Tab value="sales" leftSection={<IconReceipt size={16} />}>
            Sales History
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="stock" pt="md">
          <Stack>
            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={openStock}
              >
                Add Stock
              </Button>
            </Group>
            <Card withBorder padding={0} radius="md">
              {stocksLoading ? (
                <Center p="xl">
                  <Loader />
                </Center>
              ) : !stocks || stocks.length === 0 ? (
                <Center p="xl">
                  <Stack align="center" gap="xs">
                    <IconBoxOff size={36} color="gray" />
                    <Text c="dimmed">
                      No stock yet. Add a manual entry or confirm a purchase order.
                    </Text>
                  </Stack>
                </Center>
              ) : (
                <Table.ScrollContainer minWidth={500}>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Quantity</Table.Th>
                        <Table.Th>Available</Table.Th>
                        <Table.Th>Unit cost</Table.Th>
                        <Table.Th>Source</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stocks.map((s) => (
                        <Table.Tr key={s.id}>
                          <Table.Td>{formatDate(s.created_at)}</Table.Td>
                          <Table.Td>{formatNumber(s.quantity, 2)}</Table.Td>
                          <Table.Td>{formatNumber(s.available_quantity, 2)}</Table.Td>
                          <Table.Td>{formatCurrency(s.unit_cost)}</Table.Td>
                          <Table.Td>
                            <Badge variant="light" size="sm">
                              {s.source}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="financial" pt="md">
          {financialLoading ? (
            <Center p="xl">
              <Loader />
            </Center>
          ) : !financial ? (
            <Center p="xl">
              <Text c="dimmed">No financial data</Text>
            </Center>
          ) : (
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Purchased qty
                  </Text>
                  <Text fw={700} size="lg">
                    {formatNumber(financial.total_purchased_quantity, 2)}
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Purchase cost
                  </Text>
                  <Text fw={700} size="lg" c="red">
                    {formatCurrency(financial.total_purchase_cost)}
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Sold qty
                  </Text>
                  <Text fw={700} size="lg">
                    {formatNumber(financial.total_sold_quantity, 2)}
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Sales revenue
                  </Text>
                  <Text fw={700} size="lg" c="blue">
                    {formatCurrency(financial.total_sales_revenue)}
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Profit
                  </Text>
                  <Text fw={700} size="xl" c="green">
                    {formatCurrency(financial.profit)}
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase">
                    Profit margin
                  </Text>
                  <Text fw={700} size="xl" c="yellow">
                    {formatNumber(financial.profit_margin, 2)}%
                  </Text>
                </Card>
              </Grid.Col>
            </Grid>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="purchases" pt="md">
          <Card withBorder padding={0} radius="md">
            {purchaseHistory.length === 0 ? (
              <Center p="xl">
                <Stack align="center" gap="xs">
                  <IconShoppingCart size={36} color="gray" />
                  <Text c="dimmed">No purchases for this product yet</Text>
                </Stack>
              </Center>
            ) : (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Order</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Supplier</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Unit price</Table.Th>
                    <Table.Th>Total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {purchaseHistory.map(({ order, item }) => (
                    <Table.Tr key={`${order.id}-${item.id}`}>
                      <Table.Td>
                        <Anchor onClick={() => navigate(`/purchases/${order.id}`)}>
                          #{order.id}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{formatDate(order.created_at)}</Table.Td>
                      <Table.Td>{order.supplier}</Table.Td>
                      <Table.Td>
                        <Badge color={statusColor[order.status]} variant="light">
                          {order.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{formatNumber(item.quantity, 2)}</Table.Td>
                      <Table.Td>{formatCurrency(item.unit_price)}</Table.Td>
                      <Table.Td>{formatCurrency(item.total_price ?? 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="sales" pt="md">
          <Card withBorder padding={0} radius="md">
            {salesHistory.length === 0 ? (
              <Center p="xl">
                <Stack align="center" gap="xs">
                  <IconReceipt size={36} color="gray" />
                  <Text c="dimmed">No sales for this product yet</Text>
                </Stack>
              </Center>
            ) : (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Order</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Customer</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Quantity</Table.Th>
                    <Table.Th>Unit price</Table.Th>
                    <Table.Th>Total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {salesHistory.map(({ order, item }) => (
                    <Table.Tr key={`${order.id}-${item.id}`}>
                      <Table.Td>
                        <Anchor onClick={() => navigate(`/sales/${order.id}`)}>
                          #{order.id}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{formatDate(order.created_at)}</Table.Td>
                      <Table.Td>{order.customer}</Table.Td>
                      <Table.Td>
                        <Badge color={statusColor[order.status]} variant="light">
                          {order.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{formatNumber(item.quantity, 2)}</Table.Td>
                      <Table.Td>{formatCurrency(item.unit_price)}</Table.Td>
                      <Table.Td>{formatCurrency(item.total_price ?? 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={stockOpen} onClose={closeStock} title="Add Stock" centered>
        <form onSubmit={stockForm.onSubmit(handleAddStock)}>
          <Stack>
            <NumberInput
              label="Quantity"
              placeholder="0"
              min={0}
              decimalScale={4}
              {...stockForm.getInputProps('quantity')}
            />
            <NumberInput
              label="Unit cost"
              placeholder="0.00"
              min={0}
              decimalScale={2}
              prefix="$"
              {...stockForm.getInputProps('unit_cost')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeStock} type="button">
                Cancel
              </Button>
              <Button type="submit" loading={createStock.isPending}>
                Add
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ProductFormModal
        mode="edit"
        opened={editOpen}
        onClose={closeEdit}
        product={product}
      />
    </Stack>
  );
}
