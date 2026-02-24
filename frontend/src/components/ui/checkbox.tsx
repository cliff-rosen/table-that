import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <div
        className={cn(
          "relative h-4 w-4 shrink-0 rounded-sm border border-gray-300 bg-white cursor-pointer transition-colors hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
          checked && "bg-blue-600 border-blue-600",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer"
          {...props}
        />
        {checked && (
          <Check className="h-3 w-3 text-white absolute inset-0 m-auto" />
        )}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
