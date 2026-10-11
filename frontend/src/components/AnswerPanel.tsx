import { Check, ChevronDown, Copy, Info, Printer, Quote, SearchX, ThumbsDown, ThumbsUp, WifiOff } from 'lucide-react'
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
    <article className="rise space-y-4" aria-live="polite">
      {answer.mode === 'offline' && (
        <div className="no-print flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <WifiOff size={16} aria-hidden /> {t.offlineMode}
        </div>
      )}

      <div className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="answer-md text-[1.02rem] leading-relaxed text-slate-800">
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
                      className="mx-0.5 inline-flex -translate-y-1 items-center rounded bg-brand-50 px-1 text-[0.7rem] font-bold text-brand-600 hover:bg-brand-100"
                      title={c ? `Rule ${c.rule}${c.sub_rule}${c.page ? ` · p.${c.page}` : ''}` : undefined}
                    >
                      {n}
                    </button>
                  )
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    {children}
                  </a>
                )
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>

        {answer.citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
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

      {answer.facts.length > 0 && (
        <div className="no-print grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {answer.facts.map((f, i) => (
            <FactChip key={f.key + i} fact={f} onOpen={onOpenPdf} index={i} />
          ))}
        </div>
      )}

      <div className="no-print space-y-2">
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

      {answer.citations.length > 0 && (
        <details open className="no-print group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-semibold text-slate-700">
            <Quote size={16} aria-hidden /> {t.sources} ({answer.citations.length})
            <ChevronDown size={16} className="ml-auto transition group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="space-y-3 px-5 pb-4">
            {answer.citations.map((c) => (
              <li key={c.n} id={`cite-${c.n}`} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">{c.n}</span>
                  <span className="font-semibold text-slate-800">
                    Rule {c.rule}
                    {c.sub_rule} · {c.title}
                  </span>
                  {c.page ? (
                    <button
                      type="button"
                      onClick={() => onOpenPdf({ page: c.page!, quote: c.quote, label: `Rule ${c.rule}${c.sub_rule}` })}
                      className="ml-auto text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {t.openPdf} {c.page} →
                    </button>
                  ) : c.pdf_url ? (
                    <a className="ml-auto text-xs font-semibold text-brand-600 hover:underline" href={c.pdf_url} target="_blank" rel="noreferrer">
                      {t.source} ↗
                    </a>
                  ) : null}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[0.78rem] leading-relaxed text-slate-700">{c.quote}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}

      {answer.facts.length > 0 && (
        <div className="no-print">
          <button type="button" onClick={() => setShowWhy((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-700">
            <Info size={15} aria-hidden /> {t.why}
            <ChevronDown size={15} className={`transition ${showWhy ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showWhy && (
            <ul className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              {answer.facts.map((f, i) => (
                <li key={f.key + i}>
                  <span className="font-semibold">{lang === 'hi' ? f.label_hi || f.label : f.label}</span>:{' '}
                  <span className="text-slate-700">{f.row_label}</span> → <strong>{f.display}</strong> ({f.citation})
                  {f.notes.length > 0 && <ul className="ml-4 list-disc text-slate-600">{f.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="no-print flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <button type="button" onClick={() => window.print()} className="btn-primary inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Printer size={16} aria-hidden /> {t.print}
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(plainText)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? t.copied : t.copy}
        </button>
        <Feedback id={answer.id} />
      </footer>
      <p className="no-print text-xs text-slate-500">
        {t.rulesVersion}: {answer.rules_version}
        {answer.latency_ms ? ` · ${(answer.latency_ms / 1000).toFixed(1)} s` : ''} · {answer.disclaimer}
      </p>

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
  if (state === 'sent') return <span className="ml-auto text-sm text-emerald-700">{t.thanks}</span>
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      {state === 'wrong' ? (
        <form
          className="flex items-center gap-1.5"
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
            className="w-64 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">{t.send}</button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              sendFeedback(id, 'correct')
              setState('sent')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
          >
            <ThumbsUp size={15} aria-hidden /> {t.correct}
          </button>
          <button
            type="button"
            onClick={() => setState('wrong')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 hover:border-red-300 hover:text-red-700"
          >
            <ThumbsDown size={15} aria-hidden /> {t.wrong}
          </button>
        </>
      )}
    </div>
  )
}

function NotFoundCard({ answer, question, onAskAgain, onBrowse }: { answer: Answer; question: string; onAskAgain: () => void; onBrowse: () => void }) {
  const { t } = useI18n()
  return (
    <article className="rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-brand-50 p-3 text-brand-600">
          <SearchX size={28} aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-brand-900">{t.notFoundTitle}</h2>
          <p className="text-sm italic text-slate-500">“{question}”</p>
          <p className="text-slate-700">{t.notFoundBody}</p>
          {answer.not_found_reason ? <p className="rounded-lg bg-slate-50 p-3 text-slate-800">{answer.not_found_reason}</p> : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={onAskAgain} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              {t.askElse}
            </button>
            <button type="button" onClick={onBrowse} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {t.browseAll}
            </button>
          </div>
          <p className="pt-2 text-xs text-slate-500">{answer.disclaimer}</p>
        </div>
      </div>
    </article>
  )
}
