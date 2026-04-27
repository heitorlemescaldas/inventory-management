import {
  Modal,
  Stack,
  TextInput,
  Select,
  Textarea,
  Group,
  Button,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import {
  useCreateProduct,
  useUpdateProduct,
  type ProductInput,
} from '../api/products';
import type { Product, UnitType } from '../types';

const unitTypeOptions: { value: UnitType; label: string }[] = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'L', label: 'Liter (L)' },
  { value: 'mL', label: 'Milliliter (mL)' },
  { value: 'unit', label: 'Unit' },
];

interface CreateProps {
  mode: 'create';
  opened: boolean;
  onClose: () => void;
  onSuccess?: (product: Product) => void;
}

interface EditProps {
  mode: 'edit';
  opened: boolean;
  onClose: () => void;
  product: Product;
  onSuccess?: (product: Product) => void;
}

type Props = CreateProps | EditProps;

export default function ProductFormModal(props: Props) {
  const { mode, opened, onClose, onSuccess } = props;
  const editing = mode === 'edit' ? props.product : null;

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(editing?.id ?? 0);

  const form = useForm<ProductInput>({
    initialValues: {
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      sku: editing?.sku ?? '',
      unit_type: editing?.unit_type ?? 'unit',
    },
    validate: {
      name: (v) => (v.trim().length < 1 ? 'Name is required' : null),
      sku: (v) => (v.trim().length < 1 ? 'SKU is required' : null),
      unit_type: (v) => (v ? null : 'Unit type is required'),
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        name: editing?.name ?? '',
        description: editing?.description ?? '',
        sku: editing?.sku ?? '',
        unit_type: editing?.unit_type ?? 'unit',
      });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing?.id]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = (values: ProductInput) => {
    if (mode === 'create') {
      createProduct.mutate(values, {
        onSuccess: (created) => {
          notifications.show({
            title: 'Product created',
            message: `${created.name} was added`,
            color: 'green',
          });
          form.reset();
          onClose();
          onSuccess?.(created);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Could not create product',
            message:
              err?.response?.data?.detail ||
              Object.values(err?.response?.data || {})[0]?.toString() ||
              'Unexpected error',
            color: 'red',
          });
        },
      });
    } else {
      updateProduct.mutate(values, {
        onSuccess: (updated) => {
          notifications.show({
            title: 'Product updated',
            message: `${updated.name} was saved`,
            color: 'green',
          });
          onClose();
          onSuccess?.(updated);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Could not update product',
            message:
              err?.response?.data?.detail ||
              Object.values(err?.response?.data || {})[0]?.toString() ||
              'Unexpected error',
            color: 'red',
          });
        },
      });
    }
  };

  const isPending =
    mode === 'create' ? createProduct.isPending : updateProduct.isPending;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={mode === 'create' ? 'Add Product' : 'Edit Product'}
      centered
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="Product name"
            {...form.getInputProps('name')}
          />
          <TextInput
            label="SKU"
            placeholder="Unique product code"
            {...form.getInputProps('sku')}
          />
          <Select
            label="Unit type"
            data={unitTypeOptions}
            {...form.getInputProps('unit_type')}
          />
          <Textarea
            label="Description"
            placeholder="Optional description"
            minRows={2}
            {...form.getInputProps('description')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {mode === 'create' ? 'Create' : 'Save changes'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
