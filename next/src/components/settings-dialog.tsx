import { Cpu, FileText } from 'lucide-react';
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Anchored above the chat input (bottom sheet style), not screen-centred */}
      <DialogContent className="max-w-lg flex flex-col gap-0 p-0 overflow-hidden top-auto bottom-28 translate-y-0 max-h-[calc(100vh-9rem)] data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4">
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
