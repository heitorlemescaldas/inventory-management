import {
  Title,
  SimpleGrid,
  Card,
  Text,
  Group,
  Stack,
  Table,
  Skeleton,
  Center,
  Anchor,
  ThemeIcon,
  Button,
} from '@mantine/core';
import {
  IconCash,
  IconCoinOff,
  IconChartBar,
  IconPercentage,
  IconChartPie,
  IconDownload,
} from '@tabler/icons-react';
import { BarChart } from '@mantine/charts';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../api/finance';
import { formatCurrency, formatNumber, downloadCsv } from '../utils/format';

interface SummaryCardProps {
  label: string;
  value: string;
  color: string;
  icon: React.ComponentType<{ size?: number }>;
}

function SummaryCard({ label, value, color, icon: Icon }: SummaryCardProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fw={700} size="xl" c={color}>
            {value}
          </Text>
        </Stack>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={92} radius="md" />
          ))}
        </SimpleGrid>
        <Skeleton height={300} radius="md" />
        <Skeleton height={300} radius="md" />
      </Stack>
    );
  }

  if (isError || !data) {
    return (
      <Stack>
        <Title order={2}>Dashboard</Title>
        <Text c="red">Failed to load dashboard data</Text>
      </Stack>
    );
  }

  const chartData = data.products_summary.map((p) => ({
    product: p.product_name,
    Revenue: parseFloat(p.total_sales_revenue),
    Cost: parseFloat(p.total_purchase_cost),
    Profit: parseFloat(p.profit),
  }));

  const handleExportCsv = () => {
    if (!data.products_summary.length) return;

    const headers = ['Product', 'Purchased Qty', 'Sold Qty', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    const rows = data.products_summary.map((p) => [
      p.product_name,
      formatNumber(p.total_purchased_quantity, 2),
      formatNumber(p.total_sold_quantity, 2),
      formatNumber(p.total_sales_revenue, 2),
      formatNumber(p.total_purchase_cost, 2),
      formatNumber(p.profit, 2),
      formatNumber(p.profit_margin, 2),
    ]);

    rows.push([
      'TOTAL',
      '',
      '',
      formatNumber(data.total_revenue, 2),
      formatNumber(data.total_cost, 2),
      formatNumber(data.total_profit, 2),
      formatNumber(data.profit_margin, 2),
    ]);

    downloadCsv('financial-summary.csv', headers, rows);
  };

  return (
    <Stack gap="lg">
      <Title order={2}>Dashboard</Title>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(data.total_revenue)}
          color="blue"
          icon={IconCash}
        />
        <SummaryCard
          label="Total Cost"
          value={formatCurrency(data.total_cost)}
          color="red"
          icon={IconCoinOff}
        />
        <SummaryCard
          label="Total Profit"
          value={formatCurrency(data.total_profit)}
          color="green"
          icon={IconChartBar}
        />
        <SummaryCard
          label="Profit Margin"
          value={`${formatNumber(data.profit_margin, 2)}%`}
          color="yellow"
          icon={IconPercentage}
        />
      </SimpleGrid>

      {data.products_summary.length > 0 && (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Card withBorder padding="lg" radius="md">
            <Title order={4} mb="md">
              Revenue vs Cost
            </Title>
            <BarChart
              h={300}
              data={chartData}
              dataKey="product"
              series={[
                { name: 'Revenue', color: 'blue' },
                { name: 'Cost', color: 'red' },
              ]}
              tickLine="y"
              valueFormatter={(value) => `$${value.toFixed(2)}`}
              xAxisProps={{
                interval: 0,
                angle: -25,
                textAnchor: 'end',
                height: 60,
                tick: { fontSize: 11 },
              }}
            />
          </Card>
          <Card withBorder padding="lg" radius="md">
            <Title order={4} mb="md">
              Profit by Product
            </Title>
            <BarChart
              h={300}
              data={chartData}
              dataKey="product"
              series={[{ name: 'Profit', color: 'teal' }]}
              tickLine="y"
              valueFormatter={(value) => `$${value.toFixed(2)}`}
              xAxisProps={{
                interval: 0,
                angle: -25,
                textAnchor: 'end',
                height: 60,
                tick: { fontSize: 11 },
              }}
            />
          </Card>
        </SimpleGrid>
      )}

      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Products financial summary</Title>
          {data.products_summary.length > 0 && (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconDownload size={16} />}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
          )}
        </Group>
        {!data.products_summary || data.products_summary.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <IconChartPie size={40} color="gray" />
              <Text c="dimmed" ta="center">
                No financial data yet. Confirm a purchase or sales order to see
                metrics here.
              </Text>
              <Group>
                <Anchor onClick={() => navigate('/purchases/new')}>
                  New purchase order
                </Anchor>
                <Text c="dimmed">·</Text>
                <Anchor onClick={() => navigate('/sales/new')}>
                  New sales order
                </Anchor>
              </Group>
            </Stack>
          </Center>
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table striped horizontalSpacing="md" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>Purchased</Table.Th>
                  <Table.Th>Sold</Table.Th>
                  <Table.Th>Revenue</Table.Th>
                  <Table.Th>Cost</Table.Th>
                  <Table.Th>Profit</Table.Th>
                  <Table.Th>Margin</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.products_summary.map((p) => (
                  <Table.Tr key={p.product_id}>
                    <Table.Td>
                      <Anchor
                        onClick={() => navigate(`/products/${p.product_id}`)}
                      >
                        {p.product_name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      {formatNumber(p.total_purchased_quantity, 2)}
                    </Table.Td>
                    <Table.Td>
                      {formatNumber(p.total_sold_quantity, 2)}
                    </Table.Td>
                    <Table.Td>
                      <Text c="blue">
                        {formatCurrency(p.total_sales_revenue)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="red">
                        {formatCurrency(p.total_purchase_cost)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="green" fw={500}>
                        {formatCurrency(p.profit)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="yellow" fw={500}>
                        {formatNumber(p.profit_margin, 2)}%
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
