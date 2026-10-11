'use client';

import * as React from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A spinner with its label, centred in the space the content will fill.
 * role="status" so a screen reader hears the label, not silence.
 */
function LoadingState({
  label,
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string
  size?: "default" | "sm"
}) {
  return (
    <div
      role="status"
      data-slot="loading-state"
      data-size={size}
      className={cn(
        "group/loading-state flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground data-[size=sm]:py-10 data-[size=sm]:text-xs",
        className
      )}
      {...props}
    >
      <Loader2
        aria-hidden="true"
        className="size-4 animate-spin group-data-[size=sm]/loading-state:size-3.5"
      />
      <span>{label}</span>
    </div>
  )
}

export { LoadingState }
