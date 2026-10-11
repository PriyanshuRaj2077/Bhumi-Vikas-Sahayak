import { Clock, Mic, MicOff, Search, ShieldAlert, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ask, type Answer, type Fact, type Meta } from '../api'
import { EXAMPLES, useI18n } from '../i18n'
import { AnswerPanel } from './AnswerPanel'
import { FactChip, Spinner, Warning, type PdfTarget } from './common'
import { BhumiLogoMark } from './Logo'

type Phase = 'idle' | 'loading' | 'done' | 'error'

interface Props {
  meta: Meta | null
  onOpenPdf: (t: PdfTarget) => void
  onOpenRule: (rule: string) => void
  onBrowse: () => void
  onPlotCheck: () => void
  pending: string | null
  clearPending: () => void
  onAnswered: () => void
}

type SpeechRec = {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export function AskView({ meta, onOpenPdf, onOpenRule, onBrowse, onPlotCheck, pending, clearPending, onAnswered }: Props) {
  const { t, lang } = useI18n()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stream, setStream] = useState('')
  const [liveFacts, setLiveFacts] = useState<Fact[]>([])
  const [toolBusy, setToolBusy] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [error, setError] = useState('')
  const [notices, setNotices] = useState<string[]>([])
  const [slow, setSlow] = useState(false)
  const [personal, setPersonal] = useState(false)
  const [listening, setListening] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recRef = useRef<SpeechRec | null>(null)

  const SpeechCtor =
    typeof window !== 'undefined'
      ? ((window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition)
      : undefined

  const submit = useCallback(
    (question?: string) => {
      const text = (question ?? q).trim()
      if (text.length < 3) {
        inputRef.current?.focus()
        return
      }
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setQ(text)
      setAsked(text)
      setPhase('loading')
      setStream('')
      setLiveFacts([])
      setAnswer(null)
      setError('')
      setNotices([])
      setSlow(false)
      setPersonal(false)
      const slowTimer = setTimeout(() => setSlow(true), 20000)
      ask(
        text,
        'auto',
        {
          onStart: (e) => setPersonal(e.personal_masked),
          onDelta: (d) => {
            setToolBusy(false)
            setStream((s) => s + d)
          },
          onDeltaReset: () => setStream(''),
          onTool: (e) => {
            setToolBusy(true)
            setLiveFacts((f) => [...f, ...e.facts])
          },
          onNotice: (m) => setNotices((n) => [...n, m]),
          onFinal: (a) => {
            clearTimeout(slowTimer)
            if (a.status === 'rule' && a.rule) {
              setPhase('idle')
              onOpenRule(a.rule)
              return
            }
            setAnswer(a)
            setPhase('done')
            onAnswered()
          },
          onError: (m) => {
            clearTimeout(slowTimer)
            setError(m)
            setPhase('error')
          },
        },
        ctrl.signal,
      )
    },
    [q, onOpenRule, onAnswered],
  )

  useEffect(() => {
    if (pending) {
      clearPending()
      submit(pending)
    }
  }, [pending, clearPending, submit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleMic = () => {
    if (!SpeechCtor) return
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechCtor()
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    rec.interimResults = true
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setQ(text)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const reset = () => {
    abortRef.current?.abort()
    setPhase('idle')
    setAnswer(null)
    setQ('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const compact = phase !== 'idle'

  return (
    <div className="space-y-6">
      {/* Campus Connect AI Finder Centered Hero */}
      {!compact && (
        <section className="no-print pt-6 pb-2 flex flex-col items-center text-center">
          {/* Centered Bespoke Bhumi Vikas Logo Mark */}
          <div className="relative mb-4 transition-transform duration-200 hover:scale-105">
            <BhumiLogoMark size={58} className="shadow-[0_8px_24px_rgba(239,123,69,0.32)]" />
          </div>

          <h2 className="font-heading font-extrabold text-3xl sm:text-4xl text-[var(--color-ink)] tracking-tight">
            {lang === 'hi' ? 'आप किस नियम की जानकारी चाहते हैं?' : 'What rule are you looking for?'}
          </h2>

          <p className="mt-2.5 max-w-xl text-sm text-[var(--color-ink-muted)] leading-relaxed">
            {lang === 'hi'
              ? 'अपने भूखंड या भवन का विवरण सरल भाषा में लिखें। मध्य प्रदेश भूमि विकास नियम, 2012 के तहत सत्यापित उत्तर प्राप्त करें।'
              : 'Describe your plot or query in plain language. The assistant verifies rules directly from statutory tables without hallucination.'}
          </p>

          {/* Campus Connect Sample Prompt Chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5 max-w-2xl">
            {EXAMPLES[lang].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => submit(ex)}
                className="query-starter-pill group"
              >
                <Sparkles size={13} className="text-[var(--color-orange)] group-hover:scale-110 transition-transform" />
                <span>{ex}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Campus-Connect Floating Search Pill Bar */}
      <section className="no-print">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="campus-card rounded-[26px] p-3 sm:p-3.5 shadow-card-lg focus-within:ring-4 focus-within:ring-[var(--color-orange)]/15 focus-within:border-[var(--color-orange)] transition-all"
        >
          <div className="flex items-start gap-3 px-2 pt-1">
            <Search className="mt-2.5 shrink-0 text-[var(--color-ink-light)]" size={20} aria-hidden />
            <textarea
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
                if (e.key === 'Escape') reset()
              }}
              rows={Math.min(4, Math.max(compact ? 1 : 2, Math.ceil(q.length / 70)))}
              placeholder={t.placeholder}
              aria-label={t.heading}
              className="min-h-[2.5rem] flex-1 resize-none bg-transparent py-1 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink-light)] outline-none"
              autoFocus
            />
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-2 px-1">
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-light)]">
              {SpeechCtor && (
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    listening
                      ? 'bg-red-500/20 text-red-500 ring-1 ring-red-500/40 animate-pulse'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-orange-tint)] hover:text-[var(--color-orange-text)]'
                  }`}
                  aria-label="Voice input"
                >
                  {listening ? <MicOff size={14} /> : <Mic size={14} />}
                  <span className="hidden sm:inline">{listening ? 'Listening...' : 'Voice'}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={phase === 'loading'}
              className="btn-primary"
            >
              <Sparkles size={15} aria-hidden />
              <span>{t.askBtn}</span>
            </button>
          </div>
        </form>

        <p className="mt-2 text-center text-[11px] text-[var(--color-ink-light)]">
          AI matches questions with official MP Bhumi Vikas tables directly.
        </p>

        {/* Recent Counter Queries */}
        {!compact && meta && meta.recent.length > 0 && (
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 font-heading font-extrabold text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">
                <Clock size={14} className="text-[var(--color-orange)]" aria-hidden /> {t.recent}
              </h3>
              <span className="text-[11px] font-mono text-[var(--color-ink-light)]">Counter records</span>
            </div>
            <div className="campus-card overflow-hidden divide-y divide-[var(--color-border-subtle)]">
              {meta.recent.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => submit(r.question)}
                  className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-orange-tint)]/40 cursor-pointer"
                >
                  <span className="truncate text-xs font-bold text-[var(--color-ink)] group-hover:text-[var(--color-orange-text)]">
                    {r.question}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--color-orange-text)]">
                    {r.status === 'not_found' ? '—' : r.rules.slice(0, 3).map((x) => `R.${x}`).join(' ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* PII Sanitization Notice */}
      {personal && (
        <div className="no-print flex items-center gap-2.5 rounded-[16px] border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs font-semibold text-red-900 dark:text-red-200 shadow-2xs">
          <ShieldAlert size={16} className="shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          <span>{t.personal}</span>
        </div>
      )}

      {/* Loading & Streaming State */}
      {phase === 'loading' && (
        <section className="no-print space-y-4" aria-busy="true">
          <div className="campus-card rounded-[22px] p-6 shadow-card">
            <p className="mb-3 text-xs font-bold text-[var(--color-ink-light)] italic">“{asked}”</p>
            {stream ? (
              <p className="caret whitespace-pre-wrap text-base leading-relaxed text-[var(--color-ink)] font-medium">
                {stream.replace(/^NOT_FOUND.*$/m, '')}
              </p>
            ) : (
              <div className="space-y-3">
                <Spinner label={toolBusy ? t.calculating : t.thinking} />
                <div className="h-4 w-4/5 animate-pulse rounded-md bg-[var(--color-surface-side)]" />
                <div className="h-4 w-3/5 animate-pulse rounded-md bg-[var(--color-surface-side)]" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {liveFacts.length > 0
              ? liveFacts.map((f, i) => <FactChip key={f.key + i} fact={f} onOpen={onOpenPdf} index={i} />)
              : [0, 1, 2].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs" />
                ))}
          </div>

          {notices.map((n) => (
            <Warning key={n}>{n}</Warning>
          ))}

          {slow && (
            <Warning>
              {t.timeout}{' '}
              <button type="button" onClick={onPlotCheck} className="font-extrabold underline text-[var(--color-orange-text)] cursor-pointer">
                {t.tabPlot} →
              </button>
            </Warning>
          )}
        </section>
      )}

      {/* Error State */}
      {phase === 'error' && (
        <div className="no-print rounded-[20px] border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-950 dark:text-red-200 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-red-600 dark:text-red-400" aria-hidden />
            <p className="font-heading font-extrabold">{t.errorTitle}</p>
          </div>
          <p className="mt-1 text-sm text-red-800 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => submit(asked)}
            className="btn-primary mt-4"
          >
            {t.retry}
          </button>
        </div>
      )}

      {/* Final Answer Display */}
      {phase === 'done' && answer && (
        <AnswerPanel answer={answer} question={asked} onOpenPdf={onOpenPdf} onAskAgain={reset} onBrowse={onBrowse} />
      )}
    </div>
  )
}
