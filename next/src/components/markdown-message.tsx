'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Pre-processes AI response content before rendering:
 * - Strips bracket tags like [HIGH], [MEDIUM], [usability] that appear before bold titles
 * - Fixes inline bullet points that appear on same line as text
 * - Ensures section headings sit on their own line, separated from following bullets
 */
function preprocessContent(content: string): string {
  return content
    // Remove severity/category tags that appear inline before ** bold **
    // e.g. "• **[HIGH] Title**" → "• **Title**"
    .replace(/\*\*\[([^\]]+)\]\s+/g, '**')
    // Remove standalone bracket tags at start of line
    .replace(/^\s*\[([A-Z][A-Za-z\s]+)\]\s*/gm, '')
    // Fix bullet points that got concatenated onto same line
    // e.g. "• item1 • item2" → "• item1\n• item2"
    .replace(/([^\n])\s*•\s+/g, '$1\n• ')
    // Convert unicode bullets at line start to markdown dash bullets so
    // react-markdown actually treats them as list items (each on its own line)
    .replace(/^\s*•\s+/gm, '- ')
    // Ensure proper spacing after horizontal rules
    .replace(/---\n([^\n])/g, '---\n\n$1');
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const processed = preprocessContent(content);

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Tables ─────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-border">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/70">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border/50 text-muted-foreground">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),

          // ── Headings — bigger, own line, clear breathing room ──────────────
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-foreground mt-5 mb-3 first:mt-0 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-foreground mt-5 mb-3 first:mt-0 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[15px] font-semibold text-foreground mt-4 mb-2 first:mt-0 tracking-tight">
              {children}
            </h3>
          ),

          // ── Paragraphs ─────────────────────────────────────────────────────
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-foreground mb-3 last:mb-0">
              {children}
            </p>
          ),

          // ── Strong / em ────────────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-muted-foreground">{children}</em>
          ),

          // ── Code ───────────────────────────────────────────────────────────
          code: ({ children, className: codeClass }) => {
            const isBlock = codeClass?.includes('language-');
            if (isBlock) {
              return (
                <code className="block bg-muted/60 rounded-md p-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-muted/60 rounded px-1.5 py-0.5 text-xs font-mono text-foreground break-words">
                {children}
              </code>
            );
          },

         // ── Lists — minimal, typographic, one item per line ────────────────
          ul: ({ children }) => (
            <ul className="my-3 space-y-2 list-none pl-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 space-y-2 pl-5 list-decimal marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            // Neutral circle marker — no colored bullet, no double marker.
            // Each li is a block, so items always stack one per line.
            <li className="flex gap-3 text-sm text-foreground leading-relaxed">
              <span
                aria-hidden="true"
                className="text-muted-foreground/70 shrink-0 select-none mt-[0.15rem] leading-none"
              >
                •
              </span>
              <span className="flex-1 min-w-0">{children}</span>
            </li>
          ),
          // ── HR ─────────────────────────────────────────────────────────────
          hr: () => <hr className="my-4 border-border/40" />,

          // ── Blockquote ─────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 my-3 text-muted-foreground italic text-sm">
              {children}
            </blockquote>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}