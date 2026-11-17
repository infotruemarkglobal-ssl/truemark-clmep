"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // Generic wrapper spreading arbitrary props (including htmlFor) to a real
    // <label> — the rule can't see the association since it's supplied by
    // each call site, not this component; callers are responsible for
    // passing htmlFor (or nesting the control), same as any raw <label>.
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- see above
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
