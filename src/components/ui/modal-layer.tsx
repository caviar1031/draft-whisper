import { Dialog } from "@base-ui/react/dialog"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface ModalLayerProps {
  children: ReactNode
  onClose: () => void
  closeOnBackdrop?: boolean
}

function ModalLayerRoot({ children, onClose, closeOnBackdrop = false }: ModalLayerProps) {
  return (
    <Dialog.Root
      open
      modal
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <div
          className="dw-modal-layer-backdrop"
          aria-hidden="true"
          onPointerDown={closeOnBackdrop ? onClose : undefined}
        />
        {children}
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ModalLayerPanel({ className, ...props }: Dialog.Popup.Props) {
  return <Dialog.Popup className={cn("dw-modal-layer-panel", className)} {...props} />
}

const ModalLayer = Object.assign(ModalLayerRoot, { Panel: ModalLayerPanel })

export { ModalLayer }
