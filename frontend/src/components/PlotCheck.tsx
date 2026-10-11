import { Calculator, Info, MessageSquareText, Printer } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { plotCheck, type Fact } from '../api'
import { useI18n } from '../i18n'
import { Warning, type PdfTarget } from './common'
import { PrintSlip } from './PrintSlip'

const SQFT = 10.7639

interface Props {
  onOpenPdf: (t: PdfTarget) => void
  onAsk: (question: string) => void
}

export function PlotCheck({ onOpenPdf, onAsk }: Props) {
  const { t, lang } = useI18n()
  const [area, setArea] = useState('200')
  const [unit, setUnit] = useState<'sqm' | 'sqft'>('sqm')
  const [road, setRoad] = useState('9')
  const [frontage, setFrontage] = useState('10')
  const [height, setHeight] = useState('10')
  const [use, setUse] = useState('residential')
  const [btype, setBtype] = useState('')
  const [builtUp, setBuiltUp] = useState('')
  const [facts, setFacts] = useState<Fact[]>([])
  const [hints, setHints] = useState<string[]>([])
  const [version, setVersion] = useState('')
  const [error, setError] = useState('')

  const areaSqm = useMemo(() => {
    const a = parseFloat(area)
    if (!a || a <= 0) return null
    return unit === 'sqft' ? Math.round((a / SQFT) * 100) / 100 : a
  }, [area, unit])

  useEffect(() => {
    const roadNum = parseFloat(road)
    if (!areaSqm || !roadNum || roadNum <= 0) {
      setFacts([])
      return
    }
    const num = (s: string) => (parseFloat(s) > 0 ? parseFloat(s) : null)
    const timer = setTimeout(() => {
      plotCheck({
        plot_area_sqm: areaSqm,
        street_width_m: roadNum,
        frontage_m: num(frontage),
        height_m: num(height),
        use,
        building_type: btype || null,
        built_up_sqm: num(builtUp),
      })
        .then((r) => {
          setFacts(r.facts)
          setHints(r.hints)
          setVersion(r.rules_version)
          setError('')
        })
        .catch((e: Error) => setError(e.message))
    }, 200)
    return () => clearTimeout(timer)
  }, [areaSqm, road, frontage, height, use, btype, builtUp])

  const question =
    lang === 'hi'
      ? `मेरा भूखंड ${areaSqm ?? area} वर्ग मीटर का है, सामने ${road} मीटर चौड़ी सड़क है, ऊँचाई ${height || '?'} मीटर। `
      : `My plot is ${areaSqm ?? area} sq m on a ${road} m road, frontage ${frontage || '?'} m, height ${height || '?'} m. `

  return (
    <div className="space-y-5">
      <section className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-brand-900">
          <Calculator size={22} aria-hidden /> {t.plotTitle}
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.plotArea}>
            <div className="flex">
              <NumInput value={area} onChange={setArea} ariaLabel={t.plotArea} className="rounded-r-none" />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'sqm' | 'sqft')}
                className="rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm"
                aria-label="unit"
              >
                <option value="sqm">sq m</option>
                <option value="sqft">sq ft</option>
              </select>
            </div>
            {unit === 'sqft' && areaSqm ? <p className="mt-1 text-xs text-slate-500">= {areaSqm} sq m</p> : null}
          </Field>
          <Field label={`${t.roadWidth} (m)`}>
            <NumInput value={road} onChange={setRoad} ariaLabel={t.roadWidth} />
          </Field>
          <Field label={`${t.frontage} (m)`}>
            <NumInput value={frontage} onChange={setFrontage} ariaLabel={t.frontage} />
          </Field>
          <Field label={`${t.height} (m)`}>
            <NumInput value={height} onChange={setHeight} ariaLabel={t.height} />
          </Field>
          <Field label={t.use}>
            <Segmented
              value={use}
              onChange={setUse}
              options={[
                ['residential', t.residential],
                ['commercial', t.commercial],
                ['shop_cum_residence', t.shopRes],
              ]}
            />
          </Field>
          <Field label={t.bType}>
            <Segmented
              value={btype}
              onChange={setBtype}
              options={[
                ['', t.auto],
                ['detached', t.detached],
                ['semi_detached', t.semi],
                ['row', t.row],
              ]}
            />
          </Field>
          <Field label={`${t.builtUp} (sq m, ${t.optional})`}>
            <NumInput value={builtUp} onChange={setBuiltUp} ariaLabel={t.builtUp} placeholder="FAR max" />
          </Field>
        </div>
      </section>

      {error && <Warning>{error}</Warning>}

      {facts.length > 0 && (
        <section className="no-print rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">{t.results}</h2>
          <ul className="divide-y divide-slate-100">
            {facts.map((f, i) => (
              <li key={f.key + i}>
                <button
                  type="button"
                  onClick={() => (f.quote || f.page) && onOpenPdf({ page: f.page, quote: f.quote, label: f.citation })}
                  className="grid w-full grid-cols-1 gap-1 px-5 py-3 text-left hover:bg-brand-50/50 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,1.2fr)_auto] sm:items-center sm:gap-4"
                >
                  <span className="text-sm font-medium text-slate-600">{lang === 'hi' ? f.label_hi || f.label : f.label}</span>
                  <span className={`font-bold tabular-nums ${f.status === 'not_eligible' ? 'text-amber-700' : 'text-brand-900'}`}>
                    {f.display}
                    {f.edge_case && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t.check}</span>}
                  </span>
                  <span className="text-xs font-semibold text-brand-600 sm:text-right">
                    {f.citation} · p.{f.page}
                    <span className="block font-normal text-slate-500">{f.row_label}</span>
                  </span>
                  {f.notes.length > 0 && (
                    <span className="flex gap-1.5 text-xs text-slate-500 sm:col-span-3">
                      <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                      {f.notes.join(' ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 px-5 pb-4">
            {hints.map((h) => (
              <Warning key={h}>{h}</Warning>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Printer size={16} aria-hidden /> {t.print}
            </button>
            <button
              type="button"
              onClick={() => onAsk(question)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <MessageSquareText size={16} aria-hidden /> {t.askFollow}
            </button>
            <span className="ml-auto self-center text-xs text-slate-500">
              {t.rulesVersion}: {version}
            </span>
          </div>
        </section>
      )}

      <PrintSlip
        question={question}
        facts={facts}
        citations={[]}
        rulesVersion={version}
        disclaimer={t.disclaimer}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function NumInput({
  value,
  onChange,
  ariaLabel,
  className = '',
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  className?: string
  placeholder?: string
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      aria-label={ariaLabel}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 ${className}`}
    />
  )
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold whitespace-nowrap ${value === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
