import { ArrowLeft, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { buttonVariants } from '../components/ui/button'
import { cn } from '../lib/utils'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 text-on-background">
      <div className="max-w-md text-center">
        <p className="font-headline text-8xl font-black text-primary">404</p>
        <h1 className="mt-4 font-headline text-3xl font-bold text-on-surface">
          Page not found
        </h1>
        <p className="mt-3 text-on-surface-variant">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link to="/" className={cn(buttonVariants(), 'min-w-40')}>
            <Home className="size-4" />
            Go home
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-w-40')}
          >
            <ArrowLeft className="size-4" />
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}
