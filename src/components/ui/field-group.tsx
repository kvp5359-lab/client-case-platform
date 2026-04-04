import * as React from "react"
import { cn } from "@/lib/utils"

export interface FieldGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  children: React.ReactNode
}

const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ label, children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center h-9 rounded-md px-3 bg-transparent",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
          "border border-input",
          className
        )}
        {...props}
      >
        <span className="text-sm text-muted-foreground/70 whitespace-nowrap mr-2">
          {label}:
        </span>
        <div className="font-semibold text-sm">
          {children}
        </div>
      </div>
    )
  }
)
FieldGroup.displayName = "FieldGroup"

export { FieldGroup }

