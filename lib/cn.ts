import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes, letting later ones win.
 *
 * shadcn puts this in `lib/utils` by default. Here it lives on its own,
 * because `lib/utils.ts` already holds ~300 lines of booking logic
 * (availability checks, slot maths, formatting) and mixing a styling helper
 * into it would make both harder to find. `components.json` points the shadcn
 * CLI at this path so generated components import the right thing.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
