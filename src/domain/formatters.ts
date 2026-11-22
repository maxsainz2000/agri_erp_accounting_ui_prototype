export function formatCurrency(amount: number, decimals: 2 | 4 = 2): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '—';
  return `${Math.round(kg).toLocaleString('en-US')} kg`;
}

export function formatBushels(bu: number | null | undefined): string {
  if (bu === null || bu === undefined) return '—';
  return `${bu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bu`;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}
