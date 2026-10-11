'use client';

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "./input"

/**
 * Input with a show/hide toggle — typing a password you can't see is the
 * most common source of a failed sign-in. Takes every Input prop except
 * `type`, which the toggle owns.
 */
function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)
  const toggleLabel = visible ? "Hide password" : "Show password"

  return (
    <div data-slot="password-input" className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="tap-target absolute right-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

export { PasswordInput }
