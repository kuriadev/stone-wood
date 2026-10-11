import * as React from "react"
import { cn } from "@/lib/cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] border border-input bg-transparent px-4 py-3 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        // The same eased focus as Input — see components/ui/input.tsx for
        // why it is these properties and not a sweeping underline. No lift
        // here: a textarea grows with its content (field-sizing-content),
        // and a box that is already changing height should not also move.
        "transition-[color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "placeholder:transition-opacity placeholder:duration-300 focus:placeholder:opacity-55",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
