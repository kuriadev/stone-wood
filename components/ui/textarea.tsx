import * as React from "react"
import { cn } from "@/lib/cn"

function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        "sw-textarea flex min-h-16 w-full min-w-0 max-w-full resize-none overflow-y-auto [overflow-wrap:anywhere] rounded-[10px] border border-input bg-transparent px-4 py-3 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        // Every text box is a fixed size: `rows` sets its height, nobody can
        // drag the corner to resize it (resize-none), and longer text
        // scrolls inside the box (overflow-y-auto) instead of growing it.
        // Boxes that sit side by side with the same `rows` are therefore
        // always the same height. min-w-0 / max-w-full / overflow-wrap keep
        // one long unbroken word from pushing the box past a phone's edge.
        // Inline `resize` styles at call sites are not used anywhere.
        "transition-[color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "placeholder:transition-opacity placeholder:duration-300 focus:placeholder:opacity-55",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
