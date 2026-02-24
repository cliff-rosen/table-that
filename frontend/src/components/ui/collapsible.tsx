import * as React from "react"
import { cn } from "@/lib/utils"

interface CollapsibleProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const Collapsible: React.FC<CollapsibleProps> = ({ 
  children, 
  open = false, 
  onOpenChange,
  className 
}) => {
  const [isOpen, setIsOpen] = React.useState(open);

  React.useEffect(() => {
    setIsOpen(open);
  }, [open]);

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <div className={cn("space-y-2", className)} data-state={isOpen ? "open" : "closed"}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          if (child.type === CollapsibleTrigger) {
            return React.cloneElement(child as React.ReactElement<CollapsibleTriggerProps>, {
              onClick: handleToggle
            });
          }
          if (child.type === CollapsibleContent) {
            return isOpen ? child : null;
          }
        }
        return child;
      })}
    </div>
  );
};

interface CollapsibleTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

const CollapsibleTrigger: React.FC<CollapsibleTriggerProps> = ({ 
  children, 
  onClick,
  className,
  asChild,
  ...props 
}) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick,
      className: cn(children.props.className, className),
      ...props
    });
  }

  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

const CollapsibleContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ 
  children,
  className,
  ...props 
}) => (
  <div 
    className={cn("animate-in slide-in-from-top-1 duration-200", className)}
    {...props}
  >
    {children}
  </div>
);

export { Collapsible, CollapsibleTrigger, CollapsibleContent }