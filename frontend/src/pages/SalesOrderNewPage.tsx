import {
  Title,
  Button,
  Group,
  Stack,
  Card,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  ActionIcon,
  Text,
  Table,
  Loader,
  Center,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAllProducts } from '../api/products';
import { useCreateSalesOrder } from '../api/sales';
import { formatCurrency } from '../utils/format';

interface ItemRow {
  product: number | string;
  quantity: number | string;
  unit_price: number | string;
}

interface FormValues {
  customer: string;
  notes: string;
  items: ItemRow[];
}

export default function SalesOrderNewPage() {
  const navigate = useNavigate();
  const { data: products, isLoading: productsLoading } = useAllProducts();
  const createOrder = useCreateSalesOrder();

  const form = useForm<FormValues>({
    initialValues: {
      customer: '',
      notes: '',
      items: [{ product: '', quantity: 1, unit_price: 0 }],
    },
    validate: {
      customer: (v) => (v.trim().length < 1 ? 'Customer is required' : null),
      items: {
        product: (v) => (v ? null : 'Select a product'),
        quantity: (v) => (Number(v) > 0 ? null : 'Must be > 0'),
        unit_price: (v) => (Number(v) >= 0 ? null : 'Must be ≥ 0'),
      },
    },
  });

  const productOptions =
    products?.map((p) => ({
      value: String(p.id),
      label: `${p.name} (${p.sku})`,
    })) ?? [];

  const grandTotal = form.values.items.reduce(
    (sum, row) =>
      sum + Number(row.quantity || 0) * Number(row.unit_price || 0),
    0
  );

  const handleSubmit = (values: FormValues) => {
    const payload = {
      customer: values.customer,
      notes: values.notes,
      items: values.items.map((it) => ({
        product: Number(it.product),
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
      })),
    };
    createOrder.mutate(payload, {
      onSuccess: (created) => {
        notifications.show({
          title: 'Sales order created',
          message: `Order #${created.id} saved as draft`,
          color: 'green',
        });
        navigate(`/sales/${created.id}`);
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Could not create order',
          message:
            err?.response?.data?.detail ||
            JSON.stringify(err?.response?.data || {}),
          color: 'red',
        });
      },
    });
  };

  return (
    <Stack gap="lg">
      <Group>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/sales')}
        >
          Back
        </Button>
        <Title order={2}>New Sales Order</Title>
      </Group>

      {productsLoading ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="lg">
            <Card withBorder padding="lg" radius="md">
              <Stack>
                <TextInput
                  label="Customer"
                  placeholder="Customer name"
                  {...form.getInputProps('customer')}
                />
                <Textarea
                  label="Notes"
                  placeholder="Optional notes"
                  minRows={2}
                  {...form.getInputProps('notes')}
                />
              </Stack>
            </Card>

            <Card withBorder padding="lg" radius="md">
              <Group justify="space-between" mb="md">
                <Title order={4}>Items</Title>
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={() =>
                    form.insertListItem('items', {
                      product: '',
                      quantity: 1,
                      unit_price: 0,
                    })
                  }
                >
                  Add Item
                </Button>
              </Group>

              {form.values.items.length === 0 ? (
                <Center p="md">
                  <Text c="dimmed">No items. Add at least one.</Text>
                </Center>
              ) : (
                <Table.ScrollContainer minWidth={700}>
                  <Table verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Product</Table.Th>
                        <Table.Th style={{ width: 140 }}>Quantity</Table.Th>
                        <Table.Th style={{ width: 160 }}>Unit price</Table.Th>
                        <Table.Th style={{ width: 140 }}>Total</Table.Th>
                        <Table.Th style={{ width: 60 }}></Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {form.values.items.map((row, idx) => {
                        const lineTotal =
                          Number(row.quantity || 0) *
                          Number(row.unit_price || 0);
                        return (
                          <Table.Tr key={idx}>
                            <Table.Td>
                              <Select
                                placeholder="Select product"
                                data={productOptions}
                                searchable
                                {...form.getInputProps(`items.${idx}.product`)}
                              />
                            </Table.Td>
                            <Table.Td>
                              <NumberInput
                                min={0}
                                decimalScale={4}
                                {...form.getInputProps(`items.${idx}.quantity`)}
                              />
                            </Table.Td>
                            <Table.Td>
                              <NumberInput
                                min={0}
                                decimalScale={2}
                                prefix="$"
                                {...form.getInputProps(
                                  `items.${idx}.unit_price`
                                )}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Text fw={500}>{formatCurrency(lineTotal)}</Text>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon
                                color="red"
                                variant="subtle"
                                disabled={form.values.items.length <= 1}
                                onClick={() =>
                                  form.removeListItem('items', idx)
                                }
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}

              <Divider my="md" />
              <Group justify="flex-end">
                <Text fw={500}>Total revenue:</Text>
                <Text fw={700} size="lg">
                  {formatCurrency(grandTotal)}
                </Text>
              </Group>
            </Card>

            <Group justify="flex-end">
              <Button variant="default" onClick={() => navigate('/sales')}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createOrder.isPending}
                disabled={form.values.items.length === 0}
              >
                Create Order
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
