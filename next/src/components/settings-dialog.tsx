'use client';

import { useEffect, useRef, useState } from 'react';
import { Cpu, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { SettingsDialogProps } from '@/types';
import { toGreyscaleJpeg } from '@/lib/greyscale';
import { useShowToast } from '@/store';

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="size-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/**
 * The photograph used on the deck cover and section dividers. Converted to
 * greyscale in the browser before upload — the Dossier template carries no
 * colour tint, and doing it here means the stored image is already correct
 * rather than relying on a later step.
 */
function DeckPhotoSection() {
  const showToast = useShowToast();
  const [url,     setUrl]     = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/deck-image', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { url: null }))
      .then(d => { if (!cancelled) setUrl(d.url ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const choose = async (file: File | null) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const { file: grey } = await toGreyscaleJpeg(file);
      const form = new FormData();
      form.set('image', grey);
      const res  = await fetch('/api/deck-image', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed.');
      setUrl(data.url ?? null);
      showToast('Deck photograph updated', { variant: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that image.');
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    try {
      await fetch('/api/deck-image', { method: 'DELETE' });
      setUrl(null);
      showToast('Reverted to the bundled photograph', { variant: 'info' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader icon={ImageIcon} label="Deck photograph" />
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={url ? 'Change deck photograph' : 'Upload deck photograph'}
          className="relative w-28 h-16 shrink-0 overflow-hidden border border-border bg-muted/40 grid place-items-center hover:border-violet-400 transition-colors"
        >
          {url ? (
            // Remote Sanity URL and local previews alike — plain <img> is
            // intentional (next/image can't optimize either here).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </button>

        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            Used on the cover and every section divider. Converted to greyscale
            automatically — the template never carries a colour tint.
            {!url && ' Currently using the bundled photograph.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {url ? 'Change photo' : 'Upload photo'}
            </Button>
            {url && (
              <Button
                type="button" variant="outline" size="sm"
                onClick={revert}
                disabled={busy}
                className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
              >
                <X className="size-3.5" />
                Use default
              </Button>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => choose(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Opened from the profile dropdown — anchored below the avatar in
          the top-right corner, not screen-centred. */}
      <DialogContent className="max-w-md flex flex-col gap-0 p-0 overflow-hidden top-16 bottom-auto left-auto right-3 translate-x-0 translate-y-0 max-h-[calc(100vh-5rem)] data-open:slide-in-from-top-2 data-closed:slide-out-to-top-2">
        {/* Header */}
        <DialogHeader className="px-6 pt-3 flex-shrink-0">
          <DialogTitle className="text-2xl">Settings</DialogTitle>
        </DialogHeader>

        {/* Single scrollable body — no tabs */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-6 space-y-8">
            {/* ── Active Context ── */}
            <div className="space-y-6">
              <SectionHeader icon={FileText} label="Active Context" />
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Answers and presentations are grounded in the research reports
                  you upload — add them with the <span className="font-semibold">+</span> button
                  next to the chat input. Choose the deck template below.
                </p>
                <Select defaultValue="monochrome-research">
                  <SelectTrigger className="w-full bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monochrome-research">Monochrome Research</SelectItem>
                    <SelectItem value="modern-minimal">Modern Minimal</SelectItem>
                    <SelectItem value="executive-dark">Executive Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Deck photograph ── */}
            <DeckPhotoSection />

            {/* ── AI Model ── */}
            <div>
              <SectionHeader icon={Cpu} label="AI Model" />
              <div className="space-y-4">
                <div className="space-y-2">
                  <Select defaultValue="qwen-2.5-14b">
                    <SelectTrigger className="w-full bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qwen-2.5-14b">Qwen 2.5 14B Instruct</SelectItem>
                      <SelectItem value="mistral-nemo">Mistral Nemo 12B</SelectItem>
                      <SelectItem value="llama-3.1-8b">Llama 3.1 8B Instruct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onOpenChange(false)}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}