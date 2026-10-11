import { ArrowLeft, BookOpen, CalendarClock, Gavel, Search } from 'lucide-react'
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
  if (selected && !detail) return <Spinner label="…" />

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:ring-4 focus-within:ring-brand-100">
        <Search size={18} className="text-slate-400" aria-hidden />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.searchRules} className="flex-1 bg-transparent py-1 outline-none" autoFocus />
      </div>
      {groups.map(([part, items]) => (
        <section key={part}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{part}</h2>
          <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {items.map((r) => (
              <li key={r.rule}>
                <button
                  type="button"
                  onClick={() => onSelect(r.rule)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="w-12 shrink-0 font-bold text-brand-600">{r.rule}</span>
                  <span className="flex-1 text-slate-700">{r.title}</span>
                  {r.amended_later && <CalendarClock size={14} className="text-amber-600" aria-label={t.amended} />}
                  <span className="text-xs text-slate-400">p.{r.page_start}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function RuleReader({ rule, onBack, onOpenPdf }: { rule: RuleDetail; onBack: () => void; onOpenPdf: (t: PdfTarget) => void }) {
  const { t, lang } = useI18n()
  // split the text at page boundaries so each part can jump to its PDF page
  const segments = rule.pages.map((p, i) => ({ page: p.page, text: rule.text.slice(p.offset, rule.pages[i + 1]?.offset ?? rule.text.length) }))
  return (
    <article className="space-y-4">
      <button type="button" onClick={onBack} className="no-print inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={16} aria-hidden /> {t.tabBrowse}
      </button>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">{rule.part}</p>
        <h1 className="text-2xl font-bold text-brand-900">
          Rule {rule.rule}: {rule.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          PDF p.{rule.page_start}
          {rule.page_end !== rule.page_start ? `–${rule.page_end}` : ''}
        </p>
        {rule.later_amendments.map((a) => (
          <div key={a.id} className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <CalendarClock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>
                {t.amendedOn} {a.effective_date_display} (Rule {a.rule_ref}):
              </strong>{' '}
              {lang === 'hi' ? a.summary_hi : a.summary_en}{' '}
              <a href={a.source_url} target="_blank" rel="noreferrer" className="underline">
                {t.source}
              </a>
            </span>
          </div>
        ))}
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {segments.map((s) => (
          <div key={s.page} className="group relative">
            <button
              type="button"
              onClick={() => onOpenPdf({ page: s.page, label: `Rule ${rule.rule}` })}
              className="no-print sticky top-0 mb-1 inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600 hover:bg-brand-100"
            >
              <BookOpen size={12} aria-hidden /> {t.page} {s.page}
            </button>
            <pre className="mb-3 overflow-x-auto whitespace-pre-wrap font-mono text-[0.8rem] leading-relaxed text-slate-800">{s.text}</pre>
          </div>
        ))}
      </div>
      {rule.amendments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-700">{t.amendmentsMeta}</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            {rule.amendments.map((a) => (
              <li key={a.notification + a.date}>
                {a.kind} Notification No. {a.notification}, dated {a.date}
              </li>
            ))}
          </ul>
        </section>
      )}
      {rule.comments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm">
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-700">
            <Gavel size={15} aria-hidden /> {t.courtNotes}
          </h2>
          {rule.comments.map((c) => (
            <p key={c} className="mb-2 text-slate-600">
              {c}
            </p>
          ))}
        </section>
      )}
    </article>
  )
}
