import { useState } from 'react'
import { useI18n } from '../i18n'

const KEY = 'bvs-onboarded'

export function Onboarding() {
  const { t } = useI18n()
  const [step, setStep] = useState(() => (localStorage.getItem(KEY) ? -1 : 0))
  if (step < 0) return null
  const steps = [t.onb1, t.onb2, t.onb3]
  const finish = () => {
    localStorage.setItem(KEY, '1')
    setStep(-1)
  }
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="rise w-full max-w-md campus-card p-6 shadow-2xl sm:p-7">
        <div className="mb-4 flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-[var(--color-orange)]' : 'bg-[var(--color-border)]'
              }`}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-ink-light)]">
          Step {step + 1} of {steps.length}
        </p>
        <p className="mt-2 text-lg font-extrabold leading-snug tracking-tight text-[var(--color-ink)] sm:text-xl font-heading">
          {steps[step]}
        </p>
        <div className="mt-7 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-side)] transition cursor-pointer"
          >
            {t.skip}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => (step === steps.length - 1 ? finish() : setStep(step + 1))}
            className="btn-primary"
          >
            {step === steps.length - 1 ? t.done : t.next}
          </button>
        </div>
      </div>
    </div>
  )
}
