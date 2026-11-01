// Types for the React Bits OptionWheel (OptionWheel.jsx, kept as JavaScript).
import type { JSX } from "react";

export interface OptionWheelProps {
  items?: string[];
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  side?: "left" | "right";
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  className?: string;
  /** StoneWood: turn to this index from outside, without calling onChange. */
  selected?: number;
  /** StoneWood: false leaves mouse-wheel scrolling to the page. */
  captureWheel?: boolean;
}

declare function OptionWheel(props: OptionWheelProps): JSX.Element;
export default OptionWheel;
