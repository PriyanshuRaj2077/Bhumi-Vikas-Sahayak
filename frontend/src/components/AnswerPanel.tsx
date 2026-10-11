import { Check, ChevronDown, Copy, HelpCircle, Printer, Quote, SearchX, ThumbsDown, ThumbsUp, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { sendFeedback, type Answer } from '../api'
import { useI18n } from '../i18n'
import { AmendmentNotice, FactChip, RuleBadge, Warning, type PdfTarget } from './common'
import { PrintSlip } from './PrintSlip'

interface Props {
  answer: Answer
  question: string
  onOpenPdf: (t: PdfTarget) => void
  onAskAgain: () => void
  onBrowse: () => void
}

export function AnswerPanel({ answer, question, onOpenPdf, onAskAgain, onBrowse }: Props) {
  if (answer.status === 'not_found') {
    return <NotFoundCard answer={answer} question={question} onAskAgain={onAskAgain} onBrowse={onBrowse} />
  }
  return <Answered answer={answer} question={question} onOpenPdf={onOpenPdf} />
}

function Answered({ answer, question, onOpenPdf }: { answer: Answer; question: string; onOpenPdf: (t: PdfTarget) => void }) {
  const { t, lang } = useI18n()
  const [copied, setCopied] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const byN = useMemo(() => new Map(answer.citations.map((c) => [c.n, c])), [answer.citations])

  const md = useMemo(() => answer.answer_md.replace(/\[(\d+)\]/g, '[$1](#cite-$1)'), [answer.answer_md])
  const openCitation = (n: number) => {
    const c = byN.get(n)
    if (c?.page) onOpenPdf({ page: c.page, quote: c.quote, label: `Rule ${c.rule}${c.sub_rule}` })
    else if (c?.pdf_url) window.open(c.pdf_url, '_blank', 'noopener')
  }
  const plainText = useMemo(() => {
    const lines = [answer.answer_md.replace(/\[\d+\]/g, '').replace(/\*\*/g, '')]
    answer.facts.forEach((f) => lines.push(`${f.label}: ${f.display} (${f.citation}, PDF p.${f.page})`))
    lines.push(`${t.rulesVersion}: ${answer.rules_version}`, answer.disclaimer)
    return lines.join('\n')
  }, [answer, t.rulesVersion])
  const firstLine = answer.answer_md.split('\n')[0].replace(/\[\d+\]/g, '').replace(/\*\*/g, '').replace(/^- /, '')

  return (
    <article className="rise space-y-5" aria-live="polite">
      {/* Offline Mode Alert */}
      {answer.mode === 'offline' && (
        <div className="no-print flex items-center gap-2.5 rounded-2xl border border-amber-300 dark:border-amber-700 bg-[var(--color-yellow-tint)] px-4 py-3 text-xs font-semibold text-[#966708] dark:text-[#FDE076]">
          <WifiOff size={15} className="text-[#B7791F]" aria-hidden /> {t.offlineMode}
        </div>
      )}

      {/* Main Answer Card */}
      <div className="no-print campus-card p-6 sm:p-7">
        <div className="answer-md text-base leading-relaxed text-[var(--color-ink)]">
          <ReactMarkdown
            components={{
              a: ({ href, children }) => {
                const m = href?.match(/^#cite-(\d+)$/)
                if (m) {
                  const n = Number(m[1])
                  const c = byN.get(n)
                  return (
                    <button
                      type="button"
                      onClick={() => openCitation(n)}
                      className="mx-1 inline-flex -translate-y-1 items-center rounded-full border border-[var(--color-orange)]/40 bg-[var(--color-orange-tint)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--color-orange-text)] shadow-2xs hover:bg-[var(--color-orange)] hover:text-white transition cursor-pointer"
                      title={c ? `Rule ${c.rule}${c.sub_rule}${c.page ? ` · p.${c.page}` : ''}` : undefined}
                    >
                      {n}
                    </button>
                  )
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer" className="text-[var(--color-orange-text)] font-semibold underline underline-offset-2 hover:opacity-80">
                    {children}
                  </a>
                )
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>

        {/* Rule Badges */}
        {answer.citations.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] pt-4">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-ink-light)] mr-1">Applicable:</span>
            {dedupeRules(answer.citations).map((c) => (
              <RuleBadge
                key={c.n}
                rule={c.rule}
                subRule={c.sub_rule}
                page={c.page}
                onOpen={c.page ? () => onOpenPdf({ page: c.page!, quote: c.quote, label: `Rule ${c.rule}${c.sub_rule}` }) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Calculated Fact Chips Grid */}
      {answer.facts.length > 0 && (
        <div className="no-print grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {answer.facts.map((f, i) => (
            <FactChip key={f.key + i} fact={f} onOpen={onOpenPdf} index={i} />
          ))}
        </div>
      )}

      {/* Amendments & Statutory Warnings */}
      <div className="no-print space-y-2.5">
        {answer.amendments.map((a) => (
          <AmendmentNotice key={a.id} a={a} />
        ))}
        {answer.warnings.map((w) => (
          <Warning key={w}>{w}</Warning>
        ))}
        {answer.unverified_numbers.length > 0 && (
          <Warning>
            {t.unverified}: <strong>{answer.unverified_numbers.join(', ')}</strong>
          </Warning>
        )}
      </div>

      {/* Statutory Citations Accordion */}
      {answer.citations.length > 0 && (
        <details open className="no-print group campus-card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4.5 text-xs font-bold uppercase tracking-wider text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]">
            <span className="flex items-center gap-2">
              <Quote size={14} className="text-[var(--color-orange)]" aria-hidden />
              <span>{t.sources} ({answer.citations.length})</span>
            </span>
            <ChevronDown size={15} className="transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="space-y-3 px-6 pb-6">
            {answer.citations.map((c) => (
              <li key={c.n} id={`cite-${c.n}`} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-user-card)] p-4 text-sm">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ink)] text-[10px] font-extrabold text-[var(--color-surface)]">
                      {c.n}
                    </span>
                    <span className="font-bold text-[var(--color-ink)]">
                      Rule {c.rule}{c.sub_rule}
                    </span>
                    <span className="hidden sm:inline text-[var(--color-ink-light)]">· {c.title}</span>
                  </div>
                  {c.page ? (
                    <button
                      type="button"
                      onClick={() => onOpenPdf({ page: c.page!, quote: c.quote, label: `Rule ${c.rule}${c.sub_rule}` })}
                      className="font-bold text-[var(--color-orange-text)] hover:underline cursor-pointer"
                    >
                      {t.openPdf} {c.page} →
                    </button>
                  ) : c.pdf_url ? (
                    <a className="font-bold text-[var(--color-orange-text)] hover:underline" href={c.pdf_url} target="_blank" rel="noreferrer">
                      {t.source} ↗
                    </a>
                  ) : null}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[var(--color-ink)] bg-[var(--color-surface)] p-3.5 rounded-xl border border-[var(--color-border-subtle)]">
                  {c.quote}
                </pre>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* "Why These Numbers" Calculation Breakdown */}
      {answer.facts.length > 0 && (
        <div className="no-print">
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition cursor-pointer"
          >
            <HelpCircle size={14} className="text-[var(--color-orange)]" aria-hidden /> {t.why}
            <ChevronDown size={13} className={`transition-transform duration-200 ${showWhy ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showWhy && (
            <ul className="mt-3 space-y-2 campus-card p-5 text-xs text-[var(--color-ink-muted)]">
              {answer.facts.map((f, i) => (
                <li key={f.key + i} className="border-b border-[var(--color-border-subtle)] pb-2.5 last:border-none last:pb-0">
                  <span className="font-bold text-[var(--color-ink)]">{lang === 'hi' ? f.label_hi || f.label : f.label}</span>:{' '}
                  <span>{f.row_label}</span> → <strong className="text-[var(--color-orange-text)]">{f.display}</strong> ({f.citation})
                  {f.notes.length > 0 && (
                    <ul className="ml-4 mt-1 list-disc text-[var(--color-ink-light)]">
                      {f.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action Footer (Print, Copy, Feedback) */}
      <footer className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => window.print()} className="btn-primary">
            <Printer size={15} aria-hidden /> <span>{t.print}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(plainText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="btn-secondary"
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            <span>{copied ? t.copied : t.copy}</span>
          </button>
        </div>
        <Feedback id={answer.id} />
      </footer>

      {/* Statutory Rules Version Metadata */}
      <p className="no-print text-center sm:text-left text-[11px] text-[var(--color-ink-light)]">
        {t.rulesVersion}: {answer.rules_version}
        {answer.latency_ms ? ` · ${(answer.latency_ms / 1000).toFixed(1)} s` : ''} · {answer.disclaimer}
      </p>

      {/* Printable Citizen Slip (Only renders on print) */}
      <PrintSlip
        question={question}
        answerLine={answer.mode === 'ai' ? firstLine : undefined}
        facts={answer.facts}
        citations={answer.citations}
        rulesVersion={answer.rules_version}
        disclaimer={answer.disclaimer}
      />
    </article>
  )
}

function dedupeRules<T extends { rule: string; sub_rule: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((c) => {
    const k = c.rule + c.sub_rule
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function Feedback({ id }: { id: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'wrong' | 'sent'>('idle')
  const [note, setNote] = useState('')
  if (state === 'sent') return <span className="text-xs font-bold text-[var(--color-green-text)]">{t.thanks}</span>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === 'wrong' ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            sendFeedback(id, 'wrong', note)
            setState('sent')
          }}
        >
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.whatWrong}
            className="w-56 rounded-full border border-[var(--color-border)] bg-[var(--color-input)] px-3.5 py-1.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-orange)]"
          />
          <button className="rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-surface)] hover:opacity-90 transition cursor-pointer">
            {t.send}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              sendFeedback(id, 'correct')
              setState('sent')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] hover:border-[var(--color-green)] hover:text-[var(--color-green-text)] transition cursor-pointer"
          >
            <ThumbsUp size={13} aria-hidden /> <span>{t.correct}</span>
          </button>
          <button
            type="button"
            onClick={() => setState('wrong')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] hover:border-red-400 hover:text-red-500 transition cursor-pointer"
          >
            <ThumbsDown size={13} aria-hidden /> <span>{t.wrong}</span>
          </button>
        </>
      )}
    </div>
  )
}

function NotFoundCard({ answer, question, onAskAgain, onBrowse }: { answer: Answer; question: string; onAskAgain: () => void; onBrowse: () => void }) {
  const { t } = useI18n()
  return (
    <article className="rise campus-card p-7 sm:p-8" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-orange-tint)] text-[var(--color-orange)]">
          <SearchX size={24} aria-hidden />
        </div>
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-ink)] font-heading">{t.notFoundTitle}</h2>
            <p className="mt-1 text-xs italic text-[var(--color-ink-light)]">“{question}”</p>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{t.notFoundBody}</p>
          {answer.not_found_reason && (
            <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-user-card)] p-3.5 text-xs text-[var(--color-ink)]">
              {answer.not_found_reason}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5 pt-2">
            <button type="button" onClick={onAskAgain} className="btn-primary">
              {t.askElse}
            </button>
            <button type="button" onClick={onBrowse} className="btn-secondary">
              {t.browseAll}
            </button>
          </div>
          <p className="pt-2 text-[11px] text-[var(--color-ink-light)]">{answer.disclaimer}</p>
        </div>
      </div>
    </article>
  )
}
