import * as React from "react"
import { Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
}

const RadioGroupContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}>({});

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, disabled, children, ...props }, ref) => {
    return (
      <RadioGroupContext.Provider value={{ value, onValueChange, disabled }}>
        <div
          ref={ref}
          className={cn("grid gap-2", className)}
          role="radiogroup"
          {...props}
        >
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, ...props }, ref) => {
    const { value: groupValue, onValueChange, disabled: groupDisabled } = React.useContext(RadioGroupContext);
    const isChecked = groupValue === value;
    const isDisabled = props.disabled || groupDisabled;

    const handleChange = () => {
      if (!isDisabled && onValueChange) {
        onValueChange(value);
      }
    };

    return (
      <div className="relative flex items-center">
        <input
          ref={ref}
          type="radio"
          checked={isChecked}
          onChange={handleChange}
          disabled={isDisabled}
          className="sr-only"
          {...props}
        />
        <div
          onClick={handleChange}
          className={cn(
            "aspect-square h-4 w-4 rounded-full border border-gray-300 cursor-pointer bg-white",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-gray-600 dark:bg-gray-800",
            isChecked && "border-blue-500 dark:border-blue-400",
            className
          )}
        >
          {isChecked && (
            <div className="flex items-center justify-center h-full">
              <Circle className="h-2.5 w-2.5 fill-blue-500 text-blue-500 dark:fill-blue-400 dark:text-blue-400" />
            </div>
          )}
        </div>
      </div>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem }