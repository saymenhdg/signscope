import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import { cn } from '../../lib/utils'

export type SlidingCardItem = {
  id: string | number
  content: React.ReactNode
  bgClass?: string
}

export type SlidingCardsHandle = {
  next: () => void
  previous: () => void
  goTo: (index: number) => void
}

type SlidingCardsProps = {
  cards: SlidingCardItem[]
  className?: string
  onActiveChange?: (index: number) => void
  onCardClick?: (index: number) => void
  visibleCount?: number
}

const SWIPE_THRESHOLD = 70
const EXIT_OFFSET = 320
const ANIMATION_MS = 260

export const SlidingCards = forwardRef<SlidingCardsHandle, SlidingCardsProps>(function SlidingCards(
  {
    cards,
    className,
    onActiveChange,
    onCardClick,
    visibleCount = 4,
  },
  ref,
) {
  const cardIdSignature = useMemo(
    () => cards.map((card) => String(card.id)).join('|'),
    [cards],
  )
  const [order, setOrder] = useState<number[]>(() => cards.map((_, index) => index))
  const [dragOffset, setDragOffset] = useState(0)
  const [animatingDirection, setAnimatingDirection] = useState<0 | 1 | -1>(0)
  const pointerStartX = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)

  useEffect(() => {
    const nextOrder = cards.map((_, index) => index)
    setOrder(nextOrder)
    setDragOffset(0)
    setAnimatingDirection(0)
  }, [cardIdSignature])

  useEffect(() => {
    if (!order.length) return
    onActiveChange?.(order[0])
  }, [order, onActiveChange])

  const rotateLeft = useCallback(() => {
    setOrder((current) => (current.length > 1 ? [...current.slice(1), current[0]] : current))
  }, [])

  const rotateRight = useCallback(() => {
    setOrder((current) => (current.length > 1 ? [current[current.length - 1], ...current.slice(0, -1)] : current))
  }, [])

  const completeSwipe = useCallback((direction: -1 | 1) => {
    setAnimatingDirection(direction)
    window.setTimeout(() => {
      if (direction === -1) rotateLeft()
      else rotateRight()
      setAnimatingDirection(0)
      setDragOffset(0)
    }, ANIMATION_MS)
  }, [rotateLeft, rotateRight])

  const resetDrag = useCallback(() => {
    setAnimatingDirection(0)
    setDragOffset(0)
  }, [])

  const previous = useCallback(() => {
    if (cards.length <= 1 || animatingDirection !== 0) return
    completeSwipe(1)
  }, [animatingDirection, cards.length, completeSwipe])

  const next = useCallback(() => {
    if (cards.length <= 1 || animatingDirection !== 0) return
    completeSwipe(-1)
  }, [animatingDirection, cards.length, completeSwipe])

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= cards.length) return
    setOrder((current) => {
      const position = current.indexOf(index)
      if (position <= 0) return current
      return [...current.slice(position), ...current.slice(0, position)]
    })
    resetDrag()
  }, [cards.length, resetDrag])

  useImperativeHandle(ref, () => ({
    next,
    previous,
    goTo,
  }), [goTo, next, previous])

  const layeredCards = useMemo(() => order.map((originalIndex, stackIndex) => ({
    originalIndex,
    stackIndex,
    card: cards[originalIndex],
  })), [cards, order])

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!order.length || animatingDirection !== 0) return
    pointerStartX.current = event.clientX
    draggingRef.current = true
    movedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!draggingRef.current || pointerStartX.current === null || animatingDirection !== 0) return
    const deltaX = event.clientX - pointerStartX.current
    if (Math.abs(deltaX) > 4) movedRef.current = true
    setDragOffset(deltaX)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (!draggingRef.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    draggingRef.current = false
    const deltaX = dragOffset
    pointerStartX.current = null
    if (deltaX <= -SWIPE_THRESHOLD) {
      completeSwipe(-1)
      return
    }
    if (deltaX >= SWIPE_THRESHOLD) {
      completeSwipe(1)
      return
    }
    resetDrag()
  }

  return (
    <section
      className={cn(
        'relative isolate grid min-h-[34rem] overflow-hidden rounded-[32px] touch-none select-none',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-4 h-20 rounded-full bg-primary/10 blur-3xl" />
      <div
        className="relative mx-auto h-[34rem] w-full max-w-[42rem]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          draggingRef.current = false
          pointerStartX.current = null
          resetDrag()
        }}
      >
        {layeredCards
          .slice(0, visibleCount)
          .slice()
          .reverse()
          .map(({ originalIndex, stackIndex, card }) => {
            const isTop = stackIndex === 0
            const depth = stackIndex + 1
            const baseTransform = `perspective(960px) translateZ(${-16 * depth}px) translateY(${10 * depth}px) translateX(0px) rotateY(0deg) scale(${1 - Math.min(stackIndex, 4) * 0.018})`
            const dragTransform = `perspective(960px) translateZ(-16px) translateY(10px) translateX(${dragOffset}px) rotateY(${dragOffset * 0.08}deg) rotateZ(${dragOffset * 0.015}deg) scale(1.01)`
            const exitTransform = `perspective(960px) translateZ(-16px) translateY(10px) translateX(${animatingDirection * EXIT_OFFSET}px) rotateY(${animatingDirection * 20}deg) rotateZ(${animatingDirection * 4}deg) scale(1.01)`
            const opacity = isTop
              ? animatingDirection !== 0
                ? 0
                : 1 - Math.min(Math.abs(dragOffset) / 160, 0.78)
              : Math.max(0.26, 1 - stackIndex * 0.12)
            const transform = isTop
              ? animatingDirection !== 0
                ? exitTransform
                : dragOffset !== 0
                  ? dragTransform
                  : baseTransform
              : baseTransform

            return (
              <article
                key={card.id}
                onClick={() => {
                  if (movedRef.current) return
                  onCardClick?.(originalIndex)
                }}
                className={cn(
                  'absolute inset-0 cursor-grab rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,22,40,0.96),rgba(8,14,28,0.99))] shadow-[0_28px_70px_rgba(3,8,20,0.45)] transition-[transform,opacity] duration-300 ease-out active:cursor-grabbing',
                  card.bgClass,
                  !isTop && 'pointer-events-none',
                )}
                style={{
                  zIndex: 100 - stackIndex,
                  opacity,
                  transform,
                  transitionDuration: isTop && (dragOffset !== 0 || animatingDirection !== 0) ? `${ANIMATION_MS}ms` : '320ms',
                }}
              >
                {card.content}
              </article>
            )
          })}
      </div>
    </section>
  )
})
