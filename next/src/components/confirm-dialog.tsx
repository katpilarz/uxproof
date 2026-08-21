'use client';

/**
 * components/confirm-dialog.tsx
 *
 * One confirmation prompt for every destructive action in the app —
 * deleting a presentation, deleting an uploaded file. Deletions here are
 * permanent (documents leave Sanity), so each one is confirmed once,
 * naming what is about to go and what goes with it.
 *
 * Screen-centred on purpose: unlike the profile and settings panels, this
 * is a decision that should interrupt, not sit quietly in the corner.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type ConfirmDialogProps = {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  title:         string;
  description:   React.ReactNode;
  confirmLabel?: string;
  /** Resolve/return once the action is done; the dialog closes on success. */
  onConfirm:     () => void | Promise<unknown>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="size-9 shrink-0 rounded-lg bg-destructive/10 text-destructive grid place-items-center">
              <AlertTriangle className="size-4.5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription asChild>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
