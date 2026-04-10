type ProgressProps = {
  value: number
}

export function Progress({ value }: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value))
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  )
}
