import * as ToastPrimitive from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react'

import { cn } from '../../lib/utils'

type ToastVariant = 'default' | 'success' | 'error'

type ToastEntry = {
  id: number
  title: string
  description?: string
  variant?: ToastVariant
}

type ToastContextValue = {
  toast: (entry: Omit<ToastEntry, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  const toast = useCallback((entry: Omit<ToastEntry, 'id'>) => {
    setToasts((prev) => [...prev, { ...entry, id: ++nextId }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className={cn(
              'group pointer-events-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border p-4 shadow-lg backdrop-blur-xl transition-all',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
              'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
              t.variant === 'success' && 'border-secondary/25 bg-secondary/10',
              t.variant === 'error' && 'border-error/25 bg-error/10',
              (!t.variant || t.variant === 'default') && 'border-outline-variant/25 bg-surface-container',
            )}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }}
          >
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-on-surface">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-1 text-xs text-on-surface-variant">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-20 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 lg:bottom-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
