import { Calculator, ChevronRight, Info, MessageSquareText, Printer, Sparkles } from 'lucide-react'
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
    <div className="space-y-6">
      {/* Parameter Control Card */}
      <section className="no-print campus-card p-6 sm:p-7">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--color-border)] pb-4">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-extrabold tracking-tight text-[var(--color-ink)] sm:text-2xl font-heading">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-orange-tint)] text-[var(--color-orange)]">
                <Calculator size={20} aria-hidden />
              </span>
              <span>{t.plotTitle}</span>
            </h1>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Instant deterministic table lookups directly from Rules 56, 42, 61 & 21. No AI extrapolation.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--color-orange)]/30 bg-[var(--color-orange-tint)] px-3 py-1 text-[11px] font-bold text-[var(--color-orange-text)]">
            <Sparkles size={11} /> 100% Deterministic
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.plotArea}>
            <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] shadow-2xs focus-within:border-[var(--color-orange)] focus-within:bg-[var(--color-surface)] focus-within:ring-2 focus-within:ring-[var(--color-orange)]/20 transition">
              <input
                inputMode="decimal"
                value={area}
                onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ''))}
                aria-label={t.plotArea}
                placeholder="200"
                className="w-full bg-transparent px-3.5 py-2.5 text-base font-bold tabular-nums text-[var(--color-ink)] outline-none"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'sqm' | 'sqft')}
                className="border-l border-[var(--color-border)] bg-[var(--color-surface-side)] px-3 text-xs font-bold text-[var(--color-ink-muted)] outline-none"
                aria-label="Unit"
              >
                <option value="sqm">sq m</option>
                <option value="sqft">sq ft</option>
              </select>
            </div>
            {unit === 'sqft' && areaSqm && (
              <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-light)]">= {areaSqm} sq m</p>
            )}
          </Field>

          <Field label={`${t.roadWidth} (m)`}>
            <NumInput value={road} onChange={setRoad} ariaLabel={t.roadWidth} placeholder="9.0" />
          </Field>

          <Field label={`${t.frontage} (m)`}>
            <NumInput value={frontage} onChange={setFrontage} ariaLabel={t.frontage} placeholder="10.0" />
          </Field>

          <Field label={`${t.height} (m)`}>
            <NumInput value={height} onChange={setHeight} ariaLabel={t.height} placeholder="10.0" />
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
            <NumInput value={builtUp} onChange={setBuiltUp} ariaLabel={t.builtUp} placeholder="e.g. 250" />
          </Field>
        </div>
      </section>

      {error && <Warning>{error}</Warning>}

      {/* Reactive Calculation Results */}
      {facts.length > 0 && (
        <section className="no-print overflow-hidden campus-card">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-side)] px-6 py-4">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-ink-muted)]">{t.results}</h2>
            <span className="font-mono text-xs text-[var(--color-ink-light)]">{facts.length} statutory facts computed</span>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)]">
            {facts.map((f, i) => (
              <button
                key={f.key + i}
                type="button"
                onClick={() => (f.quote || f.page) && onOpenPdf({ page: f.page, quote: f.quote, label: f.citation })}
                className="group flex w-full flex-col gap-2 p-5 text-left transition hover:bg-[var(--color-surface-side)]/60 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
              >
                <div className="min-w-0 sm:w-1/3">
                  <span className="text-xs font-bold text-[var(--color-ink-muted)]">
                    {lang === 'hi' ? f.label_hi || f.label : f.label}
                  </span>
                  {f.notes.length > 0 && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-ink-light)]">
                      <Info size={11} aria-hidden />
                      <span className="truncate">{f.notes[0]}</span>
                    </span>
                  )}
                </div>

                <div className="sm:w-1/3">
                  <span
                    className={`text-lg font-extrabold tracking-tight tabular-nums font-heading ${
                      f.status === 'not_eligible' ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--color-ink)]'
                    }`}
                  >
                    {f.display}
                  </span>
                  {f.edge_case && (
                    <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                      {t.check}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 text-xs sm:w-1/3 sm:justify-end">
                  <div className="text-right">
                    <span className="font-bold text-[var(--color-orange-text)]">{f.citation}</span>
                    <span className="block font-mono text-[11px] text-[var(--color-ink-light)]">p.{f.page} · {f.row_label}</span>
                  </div>
                  <ChevronRight size={15} className="text-[var(--color-ink-light)]/60 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-orange)]" aria-hidden />
                </div>
              </button>
            ))}
          </div>

          {hints.length > 0 && (
            <div className="space-y-2 p-5 border-t border-[var(--color-border)] bg-[var(--color-surface-side)]/40">
              {hints.map((h) => (
                <Warning key={h}>{h}</Warning>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => window.print()} className="btn-primary">
                <Printer size={15} aria-hidden /> <span>{t.print}</span>
              </button>
              <button
                type="button"
                onClick={() => onAsk(question)}
                className="btn-secondary"
              >
                <MessageSquareText size={15} aria-hidden /> <span>{t.askFollow}</span>
              </button>
            </div>
            <span className="font-mono text-xs text-[var(--color-ink-light)]">
              {t.rulesVersion}: {version}
            </span>
          </div>
        </section>
      )}

      {/* Printable Citizen Slip (Print-only) */}
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
    <label className="block text-xs">
      <span className="mb-1.5 block font-bold text-[var(--color-ink-muted)]">{label}</span>
      {children}
    </label>
  )
}

function NumInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  placeholder?: string
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      aria-label={ariaLabel}
      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] px-3.5 py-2.5 text-base font-bold tabular-nums text-[var(--color-ink)] shadow-2xs outline-none transition focus:border-[var(--color-orange)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-orange)]/20 placeholder:text-[var(--color-ink-light)]"
    />
  )
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-side)] p-1" role="radiogroup">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
            value === v
              ? 'bg-[var(--color-surface)] text-[var(--color-ink)] font-extrabold shadow-2xs border border-[var(--color-border)]'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)]/50'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
