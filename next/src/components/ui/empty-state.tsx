'use client';

import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The "nothing here yet" block. Hierarchy comes from colour and weight —
 * title in foreground, description in muted-foreground — never from
 * fading the muted grey, which drops it below 4.5:1. The icon is
 * decorative and is the one part allowed to be faint.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?:        LucideIcon
  title:        React.ReactNode
  description?: React.ReactNode
  action?:      React.ReactNode
  size?:        "default" | "sm"
}) {
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "group/empty-state flex flex-col items-center gap-3 py-20 text-center text-sm data-[size=sm]:gap-2 data-[size=sm]:px-4 data-[size=sm]:py-12 data-[size=sm]:text-xs",
        className
      )}
      {...props}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className="size-10 text-muted-foreground/30 group-data-[size=sm]/empty-state:size-8"
        />
      )}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
