import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SelectOption<Value extends string> {
  value: Value
  label: string
  disabled?: boolean
}

interface SelectProps<Value extends string> {
  value: Value
  options: readonly SelectOption<Value>[]
  onValueChange: (value: Value) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

function Select<Value extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  className,
}: SelectProps<Value>) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue)
      }}
    >
      <SelectPrimitive.Trigger
        className={cn("dw-custom-select-trigger", className)}
        aria-label={ariaLabel}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="dw-custom-select-icon">
          <ChevronDown size={15} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="dw-custom-select-positioner"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup className="dw-custom-select-popup">
            <SelectPrimitive.List className="dw-custom-select-list">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  className="dw-custom-select-option"
                  value={option.value}
                  disabled={option.disabled}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="dw-custom-select-indicator">
                    <Check size={14} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { Select }
