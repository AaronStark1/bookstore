import { useState } from 'react'

type Outcome = 'success' | 'cancelled' | null

/** The backend sends Stripe back to CLIENT_URL/payment-success or /payment-error. */
function readOutcome(): Outcome {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path.endsWith('/payment-success')) return 'success'
  if (path.endsWith('/payment-error')) return 'cancelled'
  return null
}

/** A stamped slip acknowledging the return from Stripe Checkout. */
export function PaymentNotice() {
  const [outcome, setOutcome] = useState<Outcome>(readOutcome)
  if (!outcome) return null

  const dismiss = () => {
    window.history.replaceState(null, '', '/')
    setOutcome(null)
  }

  return (
    <div className="notice" role="status">
      <span className="notice-seal" aria-hidden="true">
        {outcome === 'success' ? '✓' : '✕'}
      </span>
      <div>
        <strong className="label">{outcome === 'success' ? 'Acquisition Recorded' : 'Checkout Not Completed'}</strong>
        <p>
          {outcome === 'success'
            ? 'You have returned from Stripe Checkout. The volume is marked as sold in the archive.'
            : 'You left Stripe Checkout before paying, so no charge was made. The archive reserved the volume when checkout began, so it may still show as sold.'}
        </p>
      </div>
      <button type="button" className="bracket-btn label" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
