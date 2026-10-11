import { AlertTriangle, BadgeCheck, CalendarClock, ExternalLink, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AmendmentBanner, Fact } from '../api'
import { useI18n } from '../i18n'

export interface PdfTarget {
  page: number
  quote?: string
  lang?: 'en' | 'hi'
  label?: string
}

export function RuleBadge({ rule, subRule, page, onOpen }: { rule: string; subRule?: string; page?: number | null; onOpen?: () => void }) {
  const { lang } = useI18n()
  const text = `${lang === 'hi' ? 'नियम' : 'Rule'} ${rule}${subRule ?? ''}`
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-default"
      title={page ? `PDF p.${page}` : undefined}
    >
      <FileText size={12} aria-hidden />
      {text}
      {page ? <span className="font-normal text-brand-500">· p.{page}</span> : null}
    </button>
  )
}

export function FactChip({ fact, onOpen, index = 0 }: { fact: Fact; onOpen: (t: PdfTarget) => void; index?: number }) {
  const { lang, t } = useI18n()
  const label = lang === 'hi' ? fact.label_hi || fact.label : fact.label
  const tone =
    fact.status === 'not_eligible'
      ? 'border-amber-300 bg-amber-50'
      : fact.status === 'not_applicable' || fact.status === 'info'
        ? 'border-slate-200 bg-white'
        : 'border-emerald-200 bg-white'
  return (
    <button
      type="button"
      onClick={() => onOpen({ page: fact.page, quote: fact.quote || fact.source, label: fact.citation })}
      className={`rise group flex min-w-0 flex-col items-start gap-1 rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-lg font-bold leading-snug text-brand-900 tabular-nums">{fact.display}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
        <span className="font-semibold text-brand-600">
          {fact.citation} · p.{fact.page}
        </span>
        {fact.edge_case ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
            <AlertTriangle size={11} aria-hidden /> {t.check}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-emerald-700" title={t.calculated}>
            <BadgeCheck size={12} aria-hidden />
          </span>
        )}
      </span>
    </button>
  )
}

export function AmendmentNotice({ a }: { a: AmendmentBanner }) {
  const { t } = useI18n()
  return (
    <div className="rise flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="note">
      <CalendarClock className="mt-0.5 shrink-0" size={18} aria-hidden />
      <div>
        <p className="font-semibold">
          {t.amendedOn} {a.date} · Rule {a.rule_ref} {t.amendBody}
        </p>
        <p className="mt-1">{a.summary}</p>
        <p className="mt-1 text-xs text-amber-800">
          <a className="inline-flex items-center gap-1 underline" href={a.source_url} target="_blank" rel="noreferrer">
            {t.source} <ExternalLink size={11} aria-hidden />
          </a>{' '}
          · {a.gazette_reference}
        </p>
      </div>
    </div>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" aria-hidden />
      {label}
    </span>
  )
}
