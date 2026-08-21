'use client';

/**
 * components/files-view.tsx — v2 (active prompts)
 *
 * /files — the signed-in user's uploaded research files.
 *
 * CHANGES OVER v1:
 *   - The chevron sits at the very right of each accordion header and
 *     toggles the stored document summary.
 *   - "Summarize" and "Generate presentation" are ACTIVE PROMPTS: clicking
 *     one opens a fresh chat session and automatically runs the request
 *     there ("Summarize the file …" / "Generate <period> presentation")
 *     via the store's pendingPrompt handoff.
 *
 * Each file can also be deleted. Because every number in the app is
 * upload-grounded, deleting a file also deletes the research periods it
 * created — unless another upload still supplies the same period. The
 * confirmation names exactly which periods are going, and the result is
 * confirmed by a toast beneath the profile avatar.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
  Layers,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MarkdownMessage } from '@/components/markdown-message';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useNewSession, useSetPendingPrompt, useShowToast } from '@/store';
import { cn } from '@/lib/utils';

interface UserFileRow {
  _id:             string;
  filename:        string;
  mimeType?:       string;
  size?:           number;
  summary?:        string;
  reportsCreated?: string[];
  uploadedAt?:     string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(name: string): string {
  return (name.split('.').pop() || 'file').toUpperCase();
}

export function FilesView() {
  const router           = useRouter();
  const newSession       = useNewSession();
  const setPendingPrompt = useSetPendingPrompt();
  const showToast        = useShowToast();

  const [files,    setFiles]    = useState<UserFileRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** The file awaiting delete confirmation, or null. */
  const [pendingDelete, setPendingDelete] = useState<UserFileRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/files', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { files: [] }))
      .then(data => { if (!cancelled) setFiles(data.files || []); })
      .catch(e => console.warn('[files-view] load failed:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleSummary = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async (file: UserFileRow) => {
    try {
      const res  = await fetch(`/api/files/${encodeURIComponent(file._id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Could not delete the file', { variant: 'error' });
        return;
      }
      setFiles(prev => prev.filter(f => f._id !== file._id));
      setExpanded(prev => {
        const next = new Set(prev);
        next.delete(file._id);
        return next;
      });
      // Say what actually went, not just that something did — the research
      // periods leaving matters more than the file row disappearing.
      const removed: string[] = data.periodsRemoved ?? [];
      showToast(
        removed.length
          ? `Deleted ${file.filename} and its ${removed.join(', ')} data`
          : `Deleted ${file.filename}`,
        { variant: 'success' },
      );
    } catch (e) {
      console.warn('[files-view] delete failed:', e);
      showToast('Could not delete the file', { variant: 'error' });
    }
  };

  /** Open a fresh chat session and auto-run the given request there. */
  const runPrompt = (prompt: string) => {
    newSession();
    setPendingPrompt(prompt);
    router.push('/');
  };

  const goToChat = () => {
    newSession();
    router.push('/');
  };

  return (
    <motion.div
      key="files"
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
      className="h-full w-full overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="mb-2 display text-3xl">Your Files</h1>
            <p className="text-muted-foreground">
              Uploaded research files — the source of everything the assistant knows.
            </p>
          </div>
          <Button onClick={goToChat} className="gap-2 shrink-0">
            <Plus className="size-4" />
            Upload in chat
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading your files…</span>
          </div>
        )}

        {!loading && files.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FileText className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No files yet.</p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              Upload research reports from the chat with the <span className="font-semibold">+</span> button —
              CSV, JSON, TXT, Markdown or PDF. The data is extracted automatically.
            </p>
            <Button variant="outline" size="sm" onClick={goToChat} className="gap-2 mt-2">
              <Plus className="size-3.5" />
              Go to chat
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {files.map(file => {
            const isOpen  = expanded.has(file._id);
            const hasData = (file.reportsCreated?.length ?? 0) > 0;
            const latest  = hasData ? file.reportsCreated![file.reportsCreated!.length - 1] : null;

            return (
              <Card key={file._id} className="border border-border bg-card overflow-hidden p-0">
                {/* One row from md up; below that the identity block takes the
                    full width and the controls drop onto their own line, so
                    the filename and its metadata never collide with a button. */}
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex items-center gap-3 min-w-0 basis-full md:basis-0 md:flex-1">
                    <div className="size-10 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0">
                      <FileText className="size-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.filename}</p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{extOf(file.filename)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSize(file.size)}</span>
                        {file.uploadedAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDistanceToNowStrict(new Date(file.uploadedAt), { addSuffix: true })}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Extracted periods */}
                  {hasData && (
                    <div className="hidden lg:flex items-center gap-1 shrink-0">
                      {file.reportsCreated!.map(p => (
                        <Badge key={p} variant="secondary" className="font-mono text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Prompts on the left, icon actions on the right. Below md
                      this cluster takes its own full-width line and the two
                      groups justify apart; from md up it sits at the end of
                      the single row. */}
                  <div className="flex w-full items-center justify-between gap-2 md:w-auto md:shrink-0 md:justify-start">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => runPrompt(`Summarize the file "${file.filename}"`)}
                        title="Run a fresh summary in a new chat"
                        className="gap-1.5 text-xs"
                      >
                        <Sparkles className="size-3.5 text-violet-600 dark:text-violet-400" />
                        Summarize
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => latest && runPrompt(`Generate ${latest} presentation`)}
                        disabled={!hasData}
                        title={hasData
                          ? `Generate the ${latest} deck in a new chat`
                          : 'No research data was extracted from this file'}
                        className="gap-1.5 text-xs"
                      >
                        <Layers className="size-3.5" />
                        {/* The long label is the clearer one — it only shortens
                            where it would otherwise force a second wrap. */}
                        <span className="sm:hidden">Generate</span>
                        <span className="hidden sm:inline">Generate presentation</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Delete — removes the file and any research periods
                          it alone supplied. Confirmed first. */}
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setPendingDelete(file)}
                        aria-label={`Delete ${file.filename}`}
                        title="Delete file"
                        className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" />
                      </Button>

                      {/* Accordion control — very right of the header */}
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => toggleSummary(file._id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? 'Hide document summary' : 'Show document summary'}
                        title={isOpen ? 'Hide summary' : 'Show summary'}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')} />
                      </Button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-muted/30 px-4 py-4">
                    {file.summary
                      ? <MarkdownMessage content={file.summary} />
                      : <p className="text-sm text-muted-foreground">No summary was stored for this file.</p>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete this file?"
        confirmLabel="Delete file"
        description={
          <>
            <span className="font-medium text-foreground">{pendingDelete?.filename}</span>{' '}
            will be removed permanently.
            {(pendingDelete?.reportsCreated?.length ?? 0) > 0 ? (
              <>
                {' '}The research data extracted from it (
                <span className="font-mono text-foreground">
                  {pendingDelete!.reportsCreated!.join(', ')}
                </span>
                ) goes with it, so analyses and decks for those periods will no
                longer have anything to stand on — unless another upload covers
                the same period.
              </>
            ) : (
              <> No research periods were extracted from it, so nothing else changes.</>
            )}
          </>
        }
        onConfirm={async () => { if (pendingDelete) await handleDelete(pendingDelete); }}
      />
    </motion.div>
  );
}
