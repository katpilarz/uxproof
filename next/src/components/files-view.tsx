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
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MarkdownMessage } from '@/components/markdown-message';
import { useNewSession, useSetPendingPrompt } from '@/store';
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

  const [files,    setFiles]    = useState<UserFileRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
        <div className="flex items-start justify-between mb-8 gap-4">
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
                <div className="flex items-center gap-3 p-4">
                  <div className="size-10 rounded-lg bg-muted text-foreground grid place-items-center shrink-0">
                    <FileText className="size-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.filename}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
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

                  {/* Extracted periods */}
                  {hasData && (
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      {file.reportsCreated!.map(p => (
                        <Badge key={p} variant="secondary" className="font-mono text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Active prompts — both open a fresh chat that runs the request */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => runPrompt(`Summarize the file "${file.filename}"`)}
                      title="Run a fresh summary in a new chat"
                      className="gap-1.5 text-xs"
                    >
                      <Sparkles className="size-3.5" />
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
                      Generate presentation
                    </Button>
                  </div>

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
    </motion.div>
  );
}
