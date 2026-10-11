import { Clock, CornerDownLeft, Mic, MicOff, Search, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ask, type Answer, type Fact, type Meta } from '../api'
import { EXAMPLES, useI18n } from '../i18n'
import { AnswerPanel } from './AnswerPanel'
import { FactChip, Spinner, Warning, type PdfTarget } from './common'

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

// Minimal typing for the Web Speech API (not in the TS DOM lib).
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
    <div className="space-y-5">
      <section className={`no-print transition-all ${compact ? '' : 'pt-6 sm:pt-10'}`}>
        {!compact && (
          <div className="mb-5 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{t.heading}</h1>
            <p className="mt-1 text-slate-500">{t.sub}</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex items-stretch gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100"
          data-onboard="search"
        >
          <Search className="ml-2 mt-3 shrink-0 text-slate-400" size={20} aria-hidden />
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
            rows={Math.min(4, Math.max(compact ? 1 : 2, Math.ceil(q.length / 64)))}
            placeholder={t.placeholder}
            aria-label={t.heading}
            className="min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-2.5 text-[1.05rem] outline-none placeholder:text-slate-400"
            autoFocus
          />
          {SpeechCtor && (
            <button
              type="button"
              onClick={toggleMic}
              className={`self-center rounded-xl p-2.5 ${listening ? 'bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-100'}`}
              aria-label="Voice input"
              title={lang === 'hi' ? 'बोलकर पूछें' : 'Speak your question'}
            >
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
          <button
            type="submit"
            disabled={phase === 'loading'}
            className="inline-flex items-center gap-2 self-center rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {t.askBtn} <CornerDownLeft size={16} aria-hidden />
          </button>
        </form>

        {!compact && (
          <>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="self-center text-sm text-slate-500">{t.try}:</span>
              {EXAMPLES[lang].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => submit(ex)}
                  className="max-w-xs truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:border-brand-300 hover:text-brand-700"
                  title={ex}
                >
                  {ex}
                </button>
              ))}
            </div>
            {meta && meta.recent.length > 0 && (
              <div className="mx-auto mt-8 max-w-2xl">
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                  <Clock size={14} aria-hidden /> {t.recent}
                </h2>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {meta.recent.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => submit(r.question)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                        <span className="flex-1 truncate text-slate-700">{r.question}</span>
                        <span className="shrink-0 text-xs font-semibold text-brand-600">
                          {r.status === 'not_found' ? '—' : r.rules.slice(0, 3).map((x) => `R.${x}`).join(' ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {personal && (
        <div className="no-print flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <ShieldAlert size={16} aria-hidden /> {t.personal}
        </div>
      )}

      {phase === 'loading' && (
        <section className="no-print space-y-4" aria-busy="true">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm italic text-slate-500">“{asked}”</p>
            {stream ? (
              <p className="caret whitespace-pre-wrap text-[1.05rem] leading-relaxed text-slate-800">{stream.replace(/^NOT_FOUND.*$/m, '')}</p>
            ) : (
              <div className="space-y-2.5">
                <Spinner label={toolBusy ? t.calculating : t.thinking} />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {liveFacts.length > 0
              ? liveFacts.map((f, i) => <FactChip key={f.key + i} fact={f} onOpen={onOpenPdf} index={i} />)
              : [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white" />)}
          </div>
          {notices.map((n) => (
            <Warning key={n}>{n}</Warning>
          ))}
          {slow && (
            <Warning>
              {t.timeout}{' '}
              <button type="button" onClick={onPlotCheck} className="font-semibold underline">
                {t.tabPlot} →
              </button>
            </Warning>
          )}
        </section>
      )}

      {phase === 'error' && (
        <div className="no-print rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <p className="font-semibold">{t.errorTitle}</p>
          <p className="mt-1 text-sm">{error}</p>
          <button type="button" onClick={() => submit(asked)} className="mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white">
            {t.retry}
          </button>
        </div>
      )}

      {phase === 'done' && answer && (
        <AnswerPanel answer={answer} question={asked} onOpenPdf={onOpenPdf} onAskAgain={reset} onBrowse={onBrowse} />
      )}
    </div>
  )
}
