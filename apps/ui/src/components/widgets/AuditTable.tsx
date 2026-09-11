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
      {/* header row */}
      <div className="grid grid-cols-7 gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {['Time','Endpoint','Model','Status','Neurons','Duration','Cached'].map(h => (
          <span key={h} className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">{h}</span>
        ))}
      </div>

      <div className="min-h-[360px]">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : error ? (
          <div className="p-4"><Badge variant="danger">{error}</Badge></div>
        ) : pageRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-muted)]">No entries.</p>
        ) : pageRows.map(row => (
          <div
            key={row.id}
            className="grid grid-cols-7 gap-2 px-4 py-2 border-b border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors"
          >
            <span className="text-xs text-[var(--color-muted)] truncate">{row.ts}</span>
            <span className="text-xs text-[var(--color-text)] truncate">{row.endpoint}</span>
            <span className="text-xs text-[var(--color-muted)] truncate">{row.model}</span>
            <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge>
            <span className="text-xs text-[var(--color-muted)]">{row.neurons.toLocaleString()}</span>
            <span className="text-xs text-[var(--color-muted)]">{row.duration_ms}ms</span>
            <Badge variant={row.cached ? 'success' : 'muted'} size="sm">
              {row.cached ? 'yes' : 'no'}
            </Badge>
          </div>
        ))}
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
        <span className="text-xs text-[var(--color-muted)]">
          Page {page + 1} of {totalPages} ({rows.length} entries)
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
