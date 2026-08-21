'use client';

/**
 * components/dashboard.tsx — v2 (real data)
 *
 * CHANGES OVER v1:
 *   The grid used to render a hardcoded demo array. It now lists the
 *   signed-in user's actual generated decks from GET /api/presentations
 *   (Sanity `presentation` documents carrying a user reference), with the
 *   stat cards computed from the same data. Download opens the stored
 *   downloadUrl; decks generated before the last server restart may have
 *   expired since /downloads files are ephemeral.
 *
 *   Each card can be deleted (confirmed first — it removes the Sanity
 *   record and the rendered .pptx, and can't be undone). Deletion is
 *   confirmed by a toast beneath the profile avatar.
 */

import { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  BarChart,
  Layers,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import PowerPointIcon from './ui/powerpoint-icon';
import { ConfirmDialog } from './confirm-dialog';
import { useShowToast } from '@/store';

type DashboardProps = {
  onChatClick: () => void;
};

interface PresentationRow {
  _id:           string;
  title?:        string;
  quarter?:      string;
  slidesCount?:  number;
  status?:       string;
  downloadUrl?:  string;
  generatedDate?: string;
}

// SCOPED EXCEPTION to "violet is the only chroma" (see CLAUDE.md).
// These hues are a decorative cover for a generated artefact: hashed from the
// document id so each deck keeps a stable, recognisable face in a grid of
// otherwise identical cards. The hue carries NO meaning — it is not status,
// not category, not data. Do not let this palette spread to chrome, status,
// type or anything a user has to interpret.
const GRADIENTS = [
  'from-purple-600 to-blue-500',
  'from-orange-400 to-pink-400',
  'from-cyan-400 to-indigo-600',
  'from-blue-400 to-emerald-400',
  'from-pink-300 to-purple-600',
  'from-sky-300 to-blue-600',
  'from-rose-400 to-fuchsia-600',
  'from-indigo-400 to-cyan-500',
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function isThisCalendarQuarter(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
}

export function Dashboard({ onChatClick }: DashboardProps) {
  const showToast = useShowToast();

  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  /** The deck awaiting delete confirmation, or null. */
  const [pendingDelete, setPendingDelete] = useState<PresentationRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/presentations', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { presentations: [] }))
      .then(data => {
        if (!cancelled) setPresentations(data.presentations || []);
      })
      .catch(e => console.warn('[dashboard] failed to load presentations:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (presentation: PresentationRow) => {
    const label = presentation.title || presentation.quarter || 'Presentation';
    try {
      const res  = await fetch(`/api/presentations/${encodeURIComponent(presentation._id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Could not delete the presentation', { variant: 'error' });
        return;
      }
      setPresentations(prev => prev.filter(p => p._id !== presentation._id));
      showToast(`Deleted “${label}”`, { variant: 'success' });
    } catch (e) {
      console.warn('[dashboard] delete failed:', e);
      showToast('Could not delete the presentation', { variant: 'error' });
    }
  };

  const totalSlides    = presentations.reduce((sum, p) => sum + (p.slidesCount ?? 0), 0);
  const thisQuarter    = presentations.filter(p => isThisCalendarQuarter(p.generatedDate)).length;
  const distinctPeriods = new Set(presentations.map(p => p.quarter).filter(Boolean)).size;

  const stats = [
    {
      label: 'Total Presentations',
      value: String(presentations.length),
      icon: FileText,
    },
    {
      label: 'This Quarter',
      value: String(thisQuarter),
      icon: Calendar,
    },
    {
      label: 'Periods Covered',
      value: String(distinctPeriods),
      icon: BarChart,
    },
    {
      label: 'Slides Generated',
      value: String(totalSlides),
      icon: Layers,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">

        <div className="mb-8">
          <h1 className="mb-2 display text-3xl">Generated Presentations</h1>
          <p className="text-muted-foreground">
            Your AI-generated UX research presentations from quarterly study data
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="p-4 sm:p-5 border border-border bg-white dark:bg-card shadow-sm shadow-violet-100/50 dark:shadow-none"
            >
              {/* min-w-0 on the label block and shrink-0 on the badge: the
                  label wraps inside its own column instead of running under
                  the icon when the tile narrows. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-semibold">
                    {loading ? '—' : stat.value}
                  </p>
                </div>
                <div className="size-9 sm:size-10 shrink-0 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <stat.icon className="size-4 sm:size-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading your presentations…</span>
          </div>
        )}

        {/* Presentations Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((presentation) => (
              <Card
                key={presentation._id}
                className="group hover:shadow-lg transition-all duration-200 overflow-hidden border border-border bg-card"
              >
                <div
                  className={`h-40 bg-gradient-to-br ${gradientFor(presentation._id)} relative flex items-center justify-center`}
                >
                  <PowerPointIcon
                    className="opacity-100 my-auto mr-10 group-hover:opacity-30 transition-opacity duration-300"
                    size={129}
                    animate={true}
                  />

                  {/* Slide count pill */}
                  <div className="absolute top-4 right-4 z-20 transition-all duration-300 opacity-100 group-hover:opacity-30">
                    <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1 text-white">
                      <span className="text-sm font-medium">{presentation.slidesCount ?? 8} Slides</span>
                    </div>
                  </div>

                  {/* Hover overlay — download and delete */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 focus-within:bg-black/30">
                    {presentation.downloadUrl && (
                      <Button size="sm" variant="secondary" asChild>
                        <a href={presentation.downloadUrl} download>
                          <Download className="size-4 mr-1" />
                          Download
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPendingDelete(presentation)}
                      aria-label={`Delete presentation ${presentation.title || presentation.quarter || ''}`.trim()}
                      title="Delete presentation"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="px-5 pt-5 pb-5">
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-1 line-clamp-2">
                        {presentation.title || 'UX Research Report'}
                      </h3>
                      <p className="text-sm text-muted-foreground">{presentation.quarter}</p>
                    </div>
                    <Badge
                      variant={presentation.status === 'completed' ? 'default' : 'secondary'}
                      className="shrink-0"
                    >
                      {presentation.status ?? 'completed'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      <span>
                        {presentation.generatedDate
                          ? new Date(presentation.generatedDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {/* Add New — high-contrast card */}
            <Card
              className="overflow-hidden border-0 cursor-pointer group transition-all duration-200 hover:scale-[1.01] bg-[#0f0f1c] dark:bg-white"
              onClick={() => onChatClick?.()}
            >
              <div className="h-full flex flex-col items-center justify-center text-center min-h-[280px] relative overflow-hidden">

                {/* Decorative circles — clipped by overflow-hidden */}
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-500/15 dark:bg-violet-400/12 pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-violet-600/10 dark:bg-violet-500/8 pointer-events-none" />
                <div className="absolute top-1/2 -translate-y-1/2 -right-6 w-20 h-20 rounded-full bg-white/4 dark:bg-black/4 pointer-events-none" />

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center px-8">

                  {/* Stacked slide icon */}
                  <div className="relative mb-6 w-10 h-8">
                    <div className="absolute -top-1 -left-1 w-10 h-8 rounded-md bg-white/15 dark:bg-black/10 rotate-[-8deg]" />
                    <div className="absolute -top-0.5 left-0.5 w-10 h-8 rounded-md bg-white/20 dark:bg-black/14 rotate-[-3deg]" />
                    <div className="relative w-10 h-8 rounded-md bg-white/90 dark:bg-[#0f0f1c]/90 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1.5V12.5M1.5 7H12.5" stroke="#0f0f1c" strokeWidth="1.5" strokeLinecap="round" className="dark:stroke-white" />
                      </svg>
                    </div>
                  </div>

                  <h3 className="font-medium mb-2 text-white dark:text-[#0f0f1c]">
                    {presentations.length === 0
                      ? 'Generate Your First Presentation'
                      : 'Generate New Presentation'}
                  </h3>
                  <p className="text-sm text-white/50 dark:text-[#0f0f1c]/50 mb-6 max-w-[190px]">
                    Use the AI chat to create a new research presentation
                  </p>

                  {/* Pill CTA */}
                  <div className="px-5 py-2 rounded-full text-xs font-medium tracking-wide
                    bg-white/12 group-hover:bg-white/20
                    dark:bg-black/8 dark:group-hover:bg-black/14
                    text-white dark:text-[#0f0f1c]
                    ring-1 ring-white/20 dark:ring-black/10
                    transition-colors duration-200"
                  >
                    Open Chat
                  </div>

                </div>
              </div>
            </Card>
          </div>
        )}

      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete this presentation?"
        confirmLabel="Delete presentation"
        description={
          <>
            <span className="font-medium text-foreground">
              {pendingDelete?.title || pendingDelete?.quarter || 'This presentation'}
            </span>{' '}
            will be removed from your dashboard, along with the generated .pptx
            file. The research data it was built from is not affected — you can
            generate the deck again from chat.
          </>
        }
        onConfirm={async () => { if (pendingDelete) await handleDelete(pendingDelete); }}
      />
    </div>
  );
}
