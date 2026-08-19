'use client';

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