import * as React from "react"
import { cn } from "@/lib/cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[46px] w-full min-w-0 rounded-[10px] border border-input bg-transparent px-4 py-1 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        // ── Focus, eased rather than switched ──
        //
        // `border-color` was missing from the transition list, so the ring
        // faded in over a border that had already snapped to its focus
        // colour — the two halves of the same state change arriving at
        // different times is what made focus feel abrupt.
        //
        // Everything that moves is a property no call site can overwrite.
        // A sweeping underline would have been the obvious alternative and
        // is not possible here: `::before`/`::after` do not render on an
        // input, and a background-image gradient is wiped out by the
        // `background` shorthand that lib/theme's `inp` sets inline.
        // `translate`, not `transform`: Tailwind v4's translate utilities set
        // the separate `translate` property, so transitioning `transform`
        // eases nothing and the lift arrives in one jump.
        "transition-[color,box-shadow,border-color,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        // A single pixel of lift. Enough to feel like the field came
        // forward to meet the cursor, small enough that nothing around it
        // appears to move.
        "focus-visible:-translate-y-px",
        // The placeholder steps back instead of vanishing, so the hint is
        // still readable while typing starts. Opacity is the one property
        // ::placeholder animates reliably.
        "placeholder:transition-opacity placeholder:duration-300 focus:placeholder:opacity-55",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
