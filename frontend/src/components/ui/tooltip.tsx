import * as React from "react"
import { cn } from "@/lib/utils"

const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

const TooltipTrigger: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-gray-900 text-white px-3 py-1.5 text-sm shadow-md",
      "absolute -top-8 left-1/2 transform -translate-x-1/2",
      "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }