import { useEffect, useState } from 'react';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Spinner } from '../primitives/Spinner';
import { recentAudit, type AuditEntry } from '../../lib/api';

const PAGE_SIZE = 10;

/**
 * Paginated audit log table built from primitives.
 * Columns: time, endpoint, model, status, neurons, duration, cached.
 */
export function AuditTable() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    recentAudit(200)
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function statusVariant(s: number) {
    if (s < 300) return 'success';
    if (s < 500) return 'warn';
    return 'danger';
  }

  return (
    <Card data-testid="audit-table" className="overflow-hidden p-0">
      <div className="overflow-x-auto" role="region" aria-label="Request audit log" tabIndex={0}>
        <table className="vf-data-table min-w-[48rem] whitespace-nowrap" aria-busy={loading}>
          <caption className="sr-only">Recent request audit</caption>
          <thead className="bg-[var(--color-surface)]">
            <tr>{['Time', 'Endpoint', 'Model', 'Status', 'Neurons', 'Duration', 'Cached'].map(heading => (
              <th key={heading} scope="col" className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">{heading}</th>
            ))}</tr>
          </thead>
          <tbody className="h-[360px] text-xs">
            {loading ? (
              <tr><td colSpan={7}><div role="status" aria-label="Loading request audit" className="flex items-center justify-center"><Spinner size="md" /></div></td></tr>
            ) : error ? (
              <tr><td colSpan={7}><div role="alert" className="p-4 whitespace-normal"><Badge variant="danger">{error}</Badge></div></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7}><p className="py-6 text-sm text-[var(--color-muted)]">No entries.</p></td></tr>
            ) : pageRows.map(row => (
              <tr key={row.id} className="hover:bg-[var(--color-surface)] transition-colors">
                <td className="text-[var(--color-muted)]">{row.ts}</td>
                <td className="text-[var(--color-text)]">{row.endpoint}</td>
                <td className="text-[var(--color-muted)]">{row.model}</td>
                <td><Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge></td>
                <td className="text-[var(--color-muted)]">{row.neurons.toLocaleString()}</td>
                <td className="text-[var(--color-muted)]">{row.duration_ms}ms</td>
                <td><Badge variant={row.cached ? 'success' : 'muted'} size="sm">{row.cached ? 'yes' : 'no'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--color-border)]">
        <span role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-muted)]">
          Page {page + 1} of {totalPages} ({rows.length} entries)
        </span>
        <nav aria-label="Audit log pages" className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </nav>
      </div>
    </Card>
  );
}
