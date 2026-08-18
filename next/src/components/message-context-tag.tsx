'use client';
 
 
import { FileText } from 'lucide-react';
 
interface MessageContextTagProps {
  project: string;
  quarter: string;
}
 
export function MessageContextTag({ project, quarter }: MessageContextTagProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 border border-border/40 w-fit">
      <FileText className="size-3 text-muted-foreground flex-shrink-0" />
      <span className="text-[11px] text-muted-foreground">
        {project} · {quarter}
      </span>
    </div>
  );
}
 