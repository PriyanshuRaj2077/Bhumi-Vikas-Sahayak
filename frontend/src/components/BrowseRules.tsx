import { ArrowLeft, BookOpen, CalendarClock, ChevronRight, Gavel, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getRule, getRules, type RuleDetail, type RuleSummary } from '../api'
import { useI18n } from '../i18n'
import { Spinner, type PdfTarget } from './common'

interface Props {
  selected: string | null
  onSelect: (rule: string | null) => void
  onOpenPdf: (t: PdfTarget) => void
}

export function BrowseRules({ selected, onSelect, onOpenPdf }: Props) {
  const { t } = useI18n()
  const [rules, setRules] = useState<RuleSummary[]>([])
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState<RuleDetail | null>(null)

  useEffect(() => {
    getRules().then(setRules)
  }, [])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    getRule(selected)
      .then((d) => {
        setDetail(d)
        onOpenPdf({ page: d.page_start, label: `Rule ${d.rule}` })
      })
      .catch(() => setDetail(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase().replace(/^(rule|नियम)\s*/, '')
    const list = f ? rules.filter((r) => r.rule.toLowerCase() === f || r.rule.toLowerCase().startsWith(f) || r.title.toLowerCase().includes(f)) : rules
    const out = new Map<string, RuleSummary[]>()
    list.forEach((r) => out.set(r.part, [...(out.get(r.part) ?? []), r]))
    return [...out.entries()]
  }, [rules, filter])

  if (selected && detail) return <RuleReader rule={detail} onBack={() => onSelect(null)} onOpenPdf={onOpenPdf} />
  if (selected && !detail) return <div className="p-8 text-center"><Spinner label="Loading statutory text…" /></div>

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="no-print flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 shadow-card focus-within:border-[var(--color-orange)] focus-within:ring-2 focus-within:ring-[var(--color-orange)]/20 transition">
        <Search size={18} className="text-[var(--color-ink-light)]" aria-hidden />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.searchRules}
          className="flex-1 bg-transparent text-sm font-medium text-[var(--color-ink)] placeholder:text-[var(--color-ink-light)] outline-none"
          autoFocus
        />
        <span className="rounded-full bg-[var(--color-surface-side)] border border-[var(--color-border)] px-3 py-1 font-mono text-xs font-bold text-[var(--color-ink-muted)]">
          106 Rules
        </span>
      </div>

      {/* Rules Directory by Parts */}
      <div className="space-y-6">
        {groups.map(([part, items]) => (
          <section key={part} className="space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-ink-muted)] px-2 font-heading">
              {part}
            </h2>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {items.map((r) => (
                <button
                  key={r.rule}
                  type="button"
                  onClick={() => onSelect(r.rule)}
                  className="campus-card group flex w-full items-center justify-between gap-3 p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-orange)]/50 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-orange-tint)] font-mono text-xs font-extrabold text-[var(--color-orange-text)]">
                      R.{r.rule}
                    </span>
                    <span className="truncate text-xs font-bold text-[var(--color-ink)] group-hover:text-[var(--color-orange)] transition-colors">
                      {r.title}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {r.amended_later && (
                      <span className="rounded-full bg-[var(--color-yellow-tint)] p-1 text-[var(--color-yellow-text)]" title={t.amended}>
                        <CalendarClock size={12} aria-label={t.amended} />
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-[var(--color-ink-light)]">p.{r.page_start}</span>
                    <ChevronRight size={14} className="text-[var(--color-ink-light)]/60 group-hover:text-[var(--color-orange)] transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function RuleReader({ rule, onBack, onOpenPdf }: { rule: RuleDetail; onBack: () => void; onOpenPdf: (t: PdfTarget) => void }) {
  const { t, lang } = useI18n()
  const segments = rule.pages.map((p, i) => ({ page: p.page, text: rule.text.slice(p.offset, rule.pages[i + 1]?.offset ?? rule.text.length) }))

  return (
    <article className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="no-print inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-bold text-[var(--color-ink)] shadow-xs hover:bg-[var(--color-surface-side)] transition cursor-pointer"
      >
        <ArrowLeft size={14} aria-hidden /> <span>{t.tabBrowse}</span>
      </button>

      {/* Header Card */}
      <header className="campus-card p-6 sm:p-7">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-orange)] font-bold">{rule.part}</span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--color-ink)] sm:text-3xl font-heading">
          Rule {rule.rule}: {rule.title}
        </h1>
        <p className="mt-1 font-mono text-xs text-[var(--color-ink-light)]">
          Official Gazette Reference: PDF p.{rule.page_start}
          {rule.page_end !== rule.page_start ? `–${rule.page_end}` : ''}
        </p>

        {rule.later_amendments.map((a) => (
          <div key={a.id} className="mt-4 flex gap-3 rounded-2xl border border-[var(--color-yellow-tint)] bg-[var(--color-yellow-tint)] p-4 text-xs text-[var(--color-ink)]">
            <CalendarClock size={16} className="mt-0.5 shrink-0 text-[var(--color-yellow-text)]" aria-hidden />
            <div>
              <p className="font-bold text-[var(--color-yellow-text)]">
                {t.amendedOn} {a.effective_date_display} (Rule {a.rule_ref})
              </p>
              <p className="mt-1 text-[var(--color-ink-muted)]">{lang === 'hi' ? a.summary_hi : a.summary_en}</p>
              <a href={a.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-bold text-[var(--color-yellow-text)] underline">
                {t.source} ↗
              </a>
            </div>
          </div>
        ))}
      </header>

      {/* Segmented Official Text with Page Buttons */}
      <div className="campus-card p-6 sm:p-7 space-y-4">
        {segments.map((s) => (
          <div key={s.page} className="group relative border-b border-[var(--color-border-subtle)] pb-5 last:border-none last:pb-0">
            <button
              type="button"
              onClick={() => onOpenPdf({ page: s.page, label: `Rule ${rule.rule}` })}
              className="no-print sticky top-2 mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-orange)]/30 bg-[var(--color-orange-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-orange-text)] shadow-xs hover:bg-[var(--color-orange)]/25 transition cursor-pointer"
            >
              <BookOpen size={11} aria-hidden /> {t.page} {s.page}
            </button>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[var(--color-ink)] bg-[var(--color-input)] p-4 rounded-xl border border-[var(--color-border)]">
              {s.text}
            </pre>
          </div>
        ))}
      </div>

      {/* Historical Gazette Amendments */}
      {rule.amendments.length > 0 && (
        <section className="campus-card p-6 text-xs">
          <h2 className="mb-2 font-extrabold uppercase tracking-wider text-[var(--color-ink-muted)]">{t.amendmentsMeta}</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-[var(--color-ink-muted)]">
            {rule.amendments.map((a) => (
              <li key={a.notification + a.date}>
                {a.kind} Notification No. {a.notification}, dated {a.date}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Judicial Court Notes */}
      {rule.comments.length > 0 && (
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-side)] p-6 text-xs shadow-2xs">
          <h2 className="mb-2 flex items-center gap-2 font-extrabold uppercase tracking-wider text-[var(--color-ink-muted)]">
            <Gavel size={14} className="text-[var(--color-orange)]" aria-hidden /> {t.courtNotes}
          </h2>
          {rule.comments.map((c) => (
            <p key={c} className="mb-2 text-[var(--color-ink-muted)] leading-relaxed">
              {c}
            </p>
          ))}
        </section>
      )}
    </article>
  )
}
