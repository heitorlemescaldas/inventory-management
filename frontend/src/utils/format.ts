export function formatCurrency(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (Number.isNaN(n as number)) return '$0.00';
  return `$${(n as number).toFixed(2)}`;
}

export function formatNumber(value: string | number | null | undefined, decimals = 2): string {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (Number.isNaN(n as number)) return '0';
  return (n as number).toFixed(decimals);
}

export function formatPercent(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  if (Number.isNaN(n as number)) return '0.00%';
  return `${(n as number).toFixed(2)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const statusColor: Record<string, string> = {
  draft: 'gray',
  confirmed: 'green',
  cancelled: 'red',
};
