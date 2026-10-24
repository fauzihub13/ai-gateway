'use client';

import * as React from 'react';
import { Eye, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatCompactIdr, formatCompactNumber, formatIdr, formatNumber } from '@/lib/utils';

/**
 * Stat card untuk angka pemakaian.
 *
 * Nilai besar diringkas (`1,23M` / `1,23B`) supaya tidak overflow, dan tiap card
 * punya tombol "Angka lengkap" untuk melihat angka aktualnya di dialog.
 */
export function UsageStatCard({
  label,
  value,
  icon: Icon,
  accent = 'primary',
  money = false,
  hint,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent?: 'primary' | 'success';
  /** Format sebagai rupiah (compact + exact). */
  money?: boolean;
  /** Konteks tambahan di dialog, mis. asal angka. */
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const display = money ? formatCompactIdr(value) : formatCompactNumber(value);
  const exact = money ? formatIdr(value) : formatNumber(value);
  const accentClass =
    accent === 'success' ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary';

  return (
    <>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-sm', accentClass)}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="min-w-0">
            <p
              className="tabular truncate font-display text-2xl font-semibold tracking-tight"
              title={exact}
            >
              {display}
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-electric hover:underline"
              aria-label={`Lihat detail ${label}`}
            >
              <Eye className="h-3 w-3" />
              Lihat
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{hint ?? 'Angka aktual pada rentang waktu terpilih.'}</DialogDescription>
          </DialogHeader>
          <p className="tabular break-all rounded-sm border border-hairline bg-muted/40 p-4 font-display text-2xl font-semibold tracking-tight">
            {exact}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
