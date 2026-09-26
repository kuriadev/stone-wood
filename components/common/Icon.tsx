"use client";

import type { CSSProperties } from "react";
import {
  LayoutGrid, ClipboardList, House, Calendar, BedDouble, Gift, UtensilsCrossed,
  Wrench, Image as ImageIcon, Package, TrendingUp, ChartColumn, MessageSquare,
  Check, CircleCheck, X, TriangleAlert, Users, Trash, Mail, Lock, Moon, Sun,
  Clock, Link as LinkIcon, Flag, Banknote, Download, FolderOpen, Menu, Search,
  Waves, Flame, CircleDot, Mic, Car, Tent,
  Leaf, TreePalm, Sunrise, Phone, Star, ChevronUp, ChevronDown,
  SunMoon, Handshake, Siren, Info, Circle, Bookmark,
  Plus, Minus, SquarePen, Pencil, LogOut, Eye, EyeOff,
  Wallet, Receipt, ClipboardCheck, LogIn, ShieldAlert, Printer, History, UserRound, CalendarClock,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared icon wrapper, used by the admin panel and the public site.
 *
 * Backed by Lucide. This file exists rather than importing Lucide directly at
 * every call site for two reasons:
 *   1. It keeps one list of the icons this app actually uses, so swapping a
 *      glyph is a one-line change here instead of a hunt through the tree.
 *   2. Lucide renamed a lot of icons in v1 (Home→House, AlertTriangle→
 *      TriangleAlert, CheckCircle→CircleCheck, BarChart3→ChartColumn). Pinning
 *      those translations in one place means a future Lucide upgrade breaks
 *      here, loudly, instead of in fifty components.
 *
 * Imports are named, so bundlers tree-shake: only the icons below ship, not
 * all 1,700.
 */

const REGISTRY = {
  grid: LayoutGrid,
  clipboard: ClipboardList,
  home: House,
  calendar: Calendar,
  bed: BedDouble,
  gift: Gift,
  utensils: UtensilsCrossed,
  toolbox: Wrench,
  image: ImageIcon,
  package: Package,
  "trending-up": TrendingUp,
  "bar-chart": ChartColumn,
  message: MessageSquare,
  check: Check,
  "check-circle": CircleCheck,
  x: X,
  alert: TriangleAlert,
  users: Users,
  trash: Trash,
  mail: Mail,
  lock: Lock,
  moon: Moon,
  sun: Sun,
  clock: Clock,
  link: LinkIcon,
  flag: Flag,
  cash: Banknote,
  download: Download,
  folder: FolderOpen,
  menu: Menu,
  search: Search,
  plus: Plus,
  minus: Minus,
  edit: SquarePen,
  // A bare pencil, distinct from `edit`s boxed pen: used where the
  // control sits inline next to a heading and a framed glyph would
  // read as a second button.
  pencil: Pencil,
  logout: LogOut,
  eye: Eye,
  "eye-off": EyeOff,

  // Resort facilities. These replace the emoji that used to be stored in
  // lib/constants.ts, so the public site and the admin panel now draw the
  // same glyph for the same thing instead of a platform-dependent emoji.
  pool: Waves,
  flame: Flame,
  billiards: CircleDot,
  mic: Mic,
  car: Car,
  tent: Tent,

  // Public-site glyphs.
  leaf: Leaf,
  // TreePalm, not PalmTree: Lucide renamed it, and pinning the
  // translation here is the whole point of this registry.
  palm: TreePalm,
  sunrise: Sunrise,
  phone: Phone,
  star: Star,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,

  // Booking-flow controls.
  "sun-moon": SunMoon,   // Whole Day — both slots
  handshake: Handshake,  // Shared tier
  siren: Siren,          // emergency cancellation reason
  info: Info,
  circle: Circle,        // neutral "Other" option
  bookmark: Bookmark,    // booking reference
  wallet: Wallet,        // sales
  receipt: Receipt,      // payment / transaction
  "clipboard-check": ClipboardCheck, // preparation / inspection
  "log-in": LogIn,       // arriving
  "shield-alert": ShieldAlert, // damage
  printer: Printer,
  history: History,
  user: UserRound,
  "calendar-clock": CalendarClock,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

interface IconProps {
  name: IconName;
  /** Pixel size for both width and height. */
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
  /** Give this only when the icon is the sole content of a control. */
  title?: string;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  style,
  className,
  title,
}: IconProps) {
  // Fall back rather than crash. `name` can arrive from the database
  // (facilities.icon) or from an older cached payload, and REGISTRY[name] for
  // an unknown value is undefined — which React renders as <undefined />, a
  // hard error that takes the whole page down. A missing glyph should be a
  // missing glyph, not a white screen.
  const Glyph = REGISTRY[name] ?? REGISTRY.package;
  if (!REGISTRY[name] && process.env.NODE_ENV !== "production") {
    console.warn(`[Icon] unknown icon name: ${String(name)}`);
  }

  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      // Decorative by default: the surrounding text already names the thing.
      // A title makes it a labelled image for icon-only buttons.
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      // inline-block, not block: `block` takes the icon out of the text flow,
      // so a parent's text-align stops centring it and it jumps to the left
      // edge. inline-block keeps it centreable by text-align AND still behaves
      // as a flex item, so one default works in both layouts.
      //
      // The negative vertical-align sits the glyph on the text baseline rather
      // than the bottom of the line box, which is what stops it riding high
      // next to a label.
      //
      // Lucide sets stroke="currentColor" itself, so an icon is always the
      // colour of the text it sits with and follows dark/light mode for free.
      style={{
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "-0.125em",
        ...style,
      }}
    />
  );
}
