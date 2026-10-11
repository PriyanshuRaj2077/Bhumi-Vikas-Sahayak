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
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-brand-900/30 p-4 backdrop-blur-[1px] sm:items-center" role="dialog" aria-modal="true">
      <div className="rise w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-saffron-500' : 'bg-slate-200'}`} />
          ))}
        </div>
        <p className="text-sm font-semibold text-slate-500">
          {step + 1} / {steps.length}
        </p>
        <p className="mt-1 text-lg font-semibold text-brand-900">{steps[step]}</p>
        <div className="mt-6 flex justify-between">
          <button type="button" onClick={finish} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            {t.skip}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => (step === steps.length - 1 ? finish() : setStep(step + 1))}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {step === steps.length - 1 ? t.done : t.next}
          </button>
        </div>
      </div>
    </div>
  )
}
