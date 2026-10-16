'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface LogRow {
  id: string;
  action: string;
  admin: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/audit')
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader title="Audit Log" description="Jejak aktivitas admin." />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(l.createdAt).toLocaleString('id-ID')}
                </TableCell>
                <TableCell>{l.admin}</TableCell>
                <TableCell className="font-medium">{l.action}</TableCell>
                <TableCell className="text-muted-foreground">
                  {l.targetType}:{l.targetId}
                </TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">
                    {l.metadata ? JSON.stringify(l.metadata) : '-'}
                  </code>
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Belum ada aktivitas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}