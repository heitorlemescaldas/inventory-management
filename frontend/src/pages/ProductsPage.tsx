import {
  Title,
  Button,
  Group,
  TextInput,
  Table,
  ActionIcon,
  Modal,
  Stack,
  Pagination,
  Text,
  Card,
  Skeleton,
  Center,
  Badge,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconEye,
  IconTrash,
  IconPencil,
  IconPackageOff,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts, useDeleteProduct } from '../api/products';
import type { Product } from '../types';
import ProductFormModal from '../components/ProductFormModal';

export default function ProductsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, isLoading, isError } = useProducts(page, search);
  const deleteProduct = useDeleteProduct();

  const totalPages = useMemo(() => {
    if (!data) return 1;
    const pageSize = data.results.length || 20;
    return Math.max(1, Math.ceil(data.count / pageSize));
  }, [data]);

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteProduct.mutate(confirmDelete.id, {
      onSuccess: () => {
        notifications.show({
          title: 'Product deleted',
          message: `${confirmDelete.name} was removed`,
          color: 'green',
        });
        setConfirmDelete(null);
      },
      onError: () => {
        notifications.show({
          title: 'Could not delete product',
          message: 'It may be referenced by orders or stock',
          color: 'red',
        });
      },
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Products</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add Product
        </Button>
      </Group>

      <TextInput
        placeholder="Search by name or SKU"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => {
          setSearch(e.currentTarget.value);
          setPage(1);
        }}
      />

      <Card withBorder padding={0} radius="md">
        {isLoading ? (
          <Stack p="md" gap="sm">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={40} radius="sm" />
            ))}
          </Stack>
        ) : isError ? (
          <Center p="xl">
            <Text c="red">Failed to load products</Text>
          </Center>
        ) : !data || data.results.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <IconPackageOff size={40} color="gray" />
              <Text c="dimmed">
                {search
                  ? `No products match "${search}"`
                  : 'No products yet. Create your first product!'}
              </Text>
              {!search && (
                <Button variant="light" onClick={openCreate}>
                  Add your first product
                </Button>
              )}
            </Stack>
          </Center>
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table striped horizontalSpacing="md" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Unit</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th style={{ width: 160 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.results.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Text
                        fw={500}
                        style={{ cursor: 'pointer' }}
                        c="blue"
                        onClick={() => navigate(`/products/${p.id}`)}
                      >
                        {p.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {p.sku}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{p.unit_type}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" lineClamp={1}>
                        {p.description || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="View">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => navigate(`/products/${p.id}`)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => setEditingProduct(p)}
                          >
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() =>
                              setConfirmDelete({ id: p.id, name: p.name })
                            }
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {data && data.count > 0 && totalPages > 1 && (
        <Group justify="center">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}

      <ProductFormModal
        mode="create"
        opened={createOpened}
        onClose={closeCreate}
      />

      {editingProduct && (
        <ProductFormModal
          mode="edit"
          opened={!!editingProduct}
          onClose={() => setEditingProduct(null)}
          product={editingProduct}
        />
      )}

      <Modal
        opened={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete product"
        centered
      >
        <Stack>
          <Text>
            Are you sure you want to delete{' '}
            <Text component="span" fw={600}>
              {confirmDelete?.name}
            </Text>
            ? This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
              loading={deleteProduct.isPending}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
