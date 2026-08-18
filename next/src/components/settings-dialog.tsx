import { Check, Link2, Palette, Cpu, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { SettingsDialogProps } from '@/types';

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="size-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-foregraound">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0 overflow-hidden max-h-[90vh]">
  <TooltipProvider delayDuration={300}>
        {/* Header */}
        <DialogHeader className="px-6 pt-3 flex-shrink-0">
          <DialogTitle className="text-2xl">Settings</DialogTitle>
        </DialogHeader>

        {/* Single scrollable body — no tabs */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-6 space-y-8">
            {/* ── Active Context ── */}
            <div className='space-y-6'>
              <SectionHeader icon={FileText} label="Active Context" />
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  The AI will use chosen report and template as its primary context for all responses and generated presentations.
                </p>
                <Select defaultValue="aurelo-q1-2026">
                  <SelectTrigger className="w-full bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aurelo-q1-2026">Aurelo — Q1 2026</SelectItem>
                    <SelectItem value="aurelo-q4-2025">Aurelo — Q4 2025</SelectItem>
                    <SelectItem value="aurelo-q3-2025">Aurelo — Q3 2025</SelectItem>
                    <SelectItem value="aurelo-q2-2025">Aurelo — Q2 2025</SelectItem>
                  </SelectContent>
                </Select>
                 <Select defaultValue="paisak4u-research">
                    <SelectTrigger className="w-full bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paisak4u-research">PAISAK4U Research</SelectItem>
                      <SelectItem value="modern-minimal">Modern Minimal</SelectItem>
                      <SelectItem value="executive-dark">Executive Dark</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
            </div>

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
                {/* Capabilities — read-only status indicators 
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {['Document Analysis', 'KPI Extraction', 'Presentation Gen', 'Business Insights'].map((cap) => (
                    <div key={cap} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/20">
                      <Check className="size-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">{cap}</span>
                    </div>
                  ))}
                </div>*/}
              </div>
            </div>

  {/* ── Branding ── */}
          <div>
            <SectionHeader icon={Palette} label="Branding" />
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap mt-4">
                {[
            { label: 'Primary', defaultValue: '#D0021B' },
            { label: 'Secondary', defaultValue: '#1A1A1A' },
            { label: 'Tertiary', defaultValue: '#6B6B6B' },
            { label: 'Quaternary', defaultValue: '#A50016' },
            { label: 'Background', defaultValue: '#E0E0E0' }
          ].map(({ label, defaultValue }) => (
                  <div key={label} className="space-y-2 rounded-xl">
                    {/* Wrap in Tooltip structure */}
                    <Tooltip>
                      <TooltipTrigger asChild>
<div className="relative w-9 h-9 overflow-hidden rounded-full border border-border/60 dark:border-white/20">

  <div
    className="w-full h-full rounded-full"
    style={{ backgroundColor: defaultValue }}
  />
</div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {defaultValue} {/* Label shown in tooltip */}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
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
</TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}