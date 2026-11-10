"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
// This app has its own theme context (sw-dark / sw-light on <html>);
// shadcn ships this file wired to next-themes, which nothing else here
// uses. Repointed so there is one source of truth for the theme.
import { useTheme } from "@/contexts/ThemeContext"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/* Unstyled Sonner: the whole look is .sw-toast in app/globals.css
   (contexts/ToastContext.tsx explains the system). */
const Toaster = ({ ...props }: ToasterProps) => {
  const { isDark } = useTheme()

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      // Clear of the floating theme toggle; on phones, of the bottom nav.
      offset={{ bottom: 88, right: 24 }}
      mobileOffset={{ bottom: 96, left: 12, right: 12 }}
      gap={10}
      visibleToasts={4}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-[18px]" strokeWidth={2} />,
        info: <InfoIcon className="size-[18px]" strokeWidth={2} />,
        warning: <TriangleAlertIcon className="size-[18px]" strokeWidth={2} />,
        error: <OctagonXIcon className="size-[18px]" strokeWidth={2} />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "sw-toast",
          content: "sw-toast__content",
          title: "sw-toast__title",
          description: "sw-toast__desc",
          icon: "sw-toast__icon",
          closeButton: "sw-toast__close",
          actionButton: "sw-toast__action",
          success: "sw-toast--success",
          error: "sw-toast--error",
          warning: "sw-toast--warning",
          info: "sw-toast--info",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
