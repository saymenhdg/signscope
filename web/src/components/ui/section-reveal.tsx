import { motion, useReducedMotion } from 'framer-motion'
import type { PropsWithChildren } from 'react'

type SectionRevealProps = PropsWithChildren<{
  className?: string
  delay?: number
  id?: string
}>

export function SectionReveal({ children, className, delay = 0, id }: SectionRevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return (
      <div className={className} id={id}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      id={id}
      initial={{ opacity: 0, y: 26, scale: 0.992 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
