import { AlertTriangle, BadgeCheck, CalendarClock, ExternalLink, FileText, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AmendmentBanner, Fact } from '../api'
import { useI18n } from '../i18n'

export interface PdfTarget {
  page: number
  quote?: string
  lang?: 'en' | 'hi'
  label?: string
}

export function RuleBadge({
  rule,
  subRule,
  page,
  onOpen,
}: {
  rule: string
  subRule?: string
  page?: number | null
  onOpen?: () => void
}) {
  const { lang } = useI18n()
  const text = `${lang === 'hi' ? 'नियम' : 'Rule'} ${rule}${subRule ?? ''}`
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-user-card)] px-3 py-1 text-xs font-bold text-[var(--color-ink)] shadow-2xs transition-all hover:bg-[var(--color-orange-tint)] hover:border-[var(--color-orange)] hover:text-[var(--color-orange-text)] disabled:cursor-default cursor-pointer"
      title={page ? `PDF p.${page}` : undefined}
    >
      <FileText size={12} className="shrink-0 text-[var(--color-orange)]" aria-hidden />
      <span>{text}</span>
      {page ? <span className="font-mono text-[11px] text-[var(--color-ink-light)]">· p.{page}</span> : null}
    </button>
  )
}

export function FactChip({
  fact,
  onOpen,
  index = 0,
}: {
  fact: Fact
  onOpen: (t: PdfTarget) => void
  index?: number
}) {
  const { lang, t } = useI18n()
  const label = lang === 'hi' ? fact.label_hi || fact.label : fact.label

  // Campus-Connect color variants for cards
  const colorSchemes = [
    { border: 'border-l-[5px] border-l-[#EF7B45]' },
    { border: 'border-l-[5px] border-l-[#5BA869]' },
    { border: 'border-l-[5px] border-l-[#6E97C9]' },
    { border: 'border-l-[5px] border-l-[#F5C13D]' },
  ]
  const scheme = colorSchemes[index % colorSchemes.length]

  return (
    <button
      type="button"
      onClick={() => onOpen({ page: fact.page, quote: fact.quote || fact.source, label: fact.citation })}
      className={`rise group relative flex min-w-0 flex-col items-start gap-1.5 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg cursor-pointer ${
        fact.status === 'not_eligible'
          ? 'border-l-[5px] border-l-amber-500 bg-[var(--color-yellow-tint)]/40'
          : scheme.border
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-ink-muted)]">{label}</span>
        {fact.edge_case ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 dark:text-amber-200">
            <AlertTriangle size={10} aria-hidden /> {t.check}
          </span>
        ) : (
          <span className="inline-flex items-center text-[var(--color-green-text)]" title={t.calculated}>
            <BadgeCheck size={16} aria-hidden />
          </span>
        )}
      </div>

      <span className="font-heading text-2xl font-extrabold tracking-tight text-[var(--color-ink)] tabular-nums">
        {fact.display}
      </span>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
        <span className="font-bold text-[var(--color-orange-text)]">
          {fact.citation}
        </span>
        <span className="font-mono text-[11px] text-[var(--color-ink-light)]">· p.{fact.page}</span>
        {fact.row_label && (
          <span className="hidden truncate text-[var(--color-ink-light)] sm:inline">
            · {fact.row_label}
          </span>
        )}
      </div>
    </button>
  )
}

export function AmendmentNotice({ a }: { a: AmendmentBanner }) {
  const { t } = useI18n()
  return (
    <div
      className="rise flex gap-3.5 rounded-[18px] border border-amber-300/80 dark:border-amber-700/60 bg-[var(--color-yellow-tint)] p-4 text-sm text-[var(--color-ink)] shadow-xs"
      role="note"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-surface)] text-[var(--color-yellow-text)] shadow-2xs border border-[var(--color-border)]">
        <CalendarClock size={18} aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-heading font-extrabold text-[#966708] dark:text-[#FDE076]">
          {t.amendedOn} {a.date} · Rule {a.rule_ref} {t.amendBody}
        </p>
        <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">{a.summary}</p>
        <p className="text-xs text-[var(--color-ink-light)]">
          <a
            className="inline-flex items-center gap-1 font-bold text-[#966708] dark:text-[#FDE076] underline hover:text-[var(--color-ink)]"
            href={a.source_url}
            target="_blank"
            rel="noreferrer"
          >
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
    <div className="flex items-start gap-3 rounded-[18px] border border-amber-200 dark:border-amber-800/50 bg-[var(--color-yellow-tint)]/80 p-3.5 text-sm text-[var(--color-ink)] shadow-2xs">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-yellow-text)]" aria-hidden />
      <div className="leading-relaxed text-[var(--color-ink-muted)] font-medium">{children}</div>
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-sm font-bold text-[var(--color-ink-muted)]" role="status">
      <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" aria-hidden />
      <span>{label}</span>
    </span>
  )
}
