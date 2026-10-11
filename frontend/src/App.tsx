import { BookOpen, Calculator, CalendarClock, FileText, MessageCircleQuestion, ShieldCheck, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { getMeta, type Meta } from './api'
import { AskView } from './components/AskView'
import { BrowseRules } from './components/BrowseRules'
import { Spinner, type PdfTarget } from './components/common'
import { Onboarding } from './components/Onboarding'
import { PlotCheck } from './components/PlotCheck'
import { useI18n } from './i18n'

const PdfPane = lazy(() => import('./components/PdfPane'))

type Tab = 'ask' | 'plot' | 'browse'

export default function App() {
  const { t, lang, setLang } = useI18n()
  const [tab, setTab] = useState<Tab>('ask')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pdf, setPdf] = useState<PdfTarget | null>(null)
  const [pdfOpenMobile, setPdfOpenMobile] = useState(false)
  const [pendingQ, setPendingQ] = useState<string | null>(null)
  const [rule, setRule] = useState<string | null>(null)
  const [showVersion, setShowVersion] = useState(false)

  const refreshMeta = useCallback(() => {
    getMeta().then(setMeta).catch(() => {})
  }, [])
  useEffect(refreshMeta, [refreshMeta])

  const openPdf = useCallback((target: PdfTarget) => {
    setPdf({ ...target })
    setPdfOpenMobile(true)
  }, [])
  const openRule = useCallback((r: string) => {
    setRule(r)
    setTab('browse')
  }, [])

  const tabs: [Tab, string, typeof BookOpen][] = [
    ['ask', t.tabAsk, MessageCircleQuestion],
    ['plot', t.tabPlot, Calculator],
    ['browse', t.tabBrowse, BookOpen],
  ]

  return (
    <div className={`min-h-screen ${lang === 'hi' ? 'hi' : ''}`}>
      <header className="no-print sticky top-0 z-30 border-b border-brand-700 bg-brand-600 text-white shadow">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5">
          <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg ring-2 ring-white/20" />
          <div className="min-w-0 leading-tight">
            <p className="text-lg font-bold">{t.appName}</p>
            <p className="truncate text-xs text-brand-100">{t.desk}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {meta && (
              <span
                className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${meta.ai_available ? 'bg-emerald-500/20 text-emerald-50' : 'bg-white/10 text-brand-100'}`}
              >
                <span className={`h-2 w-2 rounded-full ${meta.ai_available ? 'bg-emerald-300' : 'bg-slate-300'}`} />
                {meta.ai_available ? `${t.aiOn} · ${meta.provider === 'gemini' ? 'Gemini' : 'Claude'}` : t.aiOff}
              </span>
            )}
            {meta?.eval && (
              <span className="hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold lg:inline-flex" title={meta.eval.label}>
                <ShieldCheck size={13} aria-hidden /> {t.tested}: {meta.eval.correct}/{meta.eval.total}
                {meta.eval.mode === 'offline' ? ' (offline)' : ''}
              </span>
            )}
            {meta && (
              <button
                type="button"
                onClick={() => setShowVersion(true)}
                className="hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 sm:inline-flex"
              >
                <CalendarClock size={13} aria-hidden />
                <span className="hidden md:inline">{t.rulesVersion}:</span> 06-03-2025
                {meta.amendments.length ? ` + ${meta.amendments.length}` : ''}
              </button>
            )}
            <div className="flex rounded-full bg-white/10 p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Language">
              {(['en', 'hi'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lang === l}
                  onClick={() => setLang(l)}
                  className={`rounded-full px-3 py-1 ${lang === l ? 'bg-white text-brand-700' : 'text-white hover:bg-white/10'}`}
                >
                  {l === 'en' ? 'EN' : 'हिं'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] gap-1 px-4" aria-label="Sections">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id)
                if (id === 'browse') setRule(null)
              }}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-semibold transition ${tab === id ? 'border-saffron-500 text-white' : 'border-transparent text-brand-100 hover:text-white'}`}
            >
              <Icon size={16} aria-hidden /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {tab === 'ask' && (
            <AskView
              meta={meta}
              onOpenPdf={openPdf}
              onOpenRule={openRule}
              onBrowse={() => setTab('browse')}
              onPlotCheck={() => setTab('plot')}
              pending={pendingQ}
              clearPending={() => setPendingQ(null)}
              onAnswered={refreshMeta}
            />
          )}
          {tab === 'plot' && (
            <PlotCheck
              onOpenPdf={openPdf}
              onAsk={(q) => {
                setPendingQ(q)
                setTab('ask')
              }}
            />
          )}
          {tab === 'browse' && <BrowseRules selected={rule} onSelect={setRule} onOpenPdf={openPdf} />}
          <p className="no-print mt-8 text-center text-xs text-slate-500">{t.disclaimer}</p>
        </div>

        {/* desktop: sticky side pane */}
        <div className="no-print hidden lg:block">
          <div className="sticky top-[7.5rem] h-[calc(100vh-8.5rem)]">
            <Suspense fallback={<Spinner label={t.loadingPdf} />}>
              <PdfPane target={pdf} />
            </Suspense>
          </div>
        </div>
      </main>

      {/* mobile / small screens: PDF as an overlay */}
      {pdf && pdfOpenMobile && (
        <div className="no-print fixed inset-0 z-40 bg-black/40 p-2 lg:hidden">
          <div className="h-full">
            <Suspense fallback={<Spinner label={t.loadingPdf} />}>
              <PdfPane target={pdf} onClose={() => setPdfOpenMobile(false)} />
            </Suspense>
          </div>
        </div>
      )}
      {pdf && !pdfOpenMobile && (
        <button
          type="button"
          onClick={() => setPdfOpenMobile(true)}
          className="no-print fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg lg:hidden"
        >
          <FileText size={16} aria-hidden /> PDF p.{pdf.page}
        </button>
      )}

      {showVersion && meta && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-brand-900/30 p-4" role="dialog" aria-modal="true" onClick={() => setShowVersion(false)}>
          <div className="rise w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-brand-900">{t.rulesVersion}</h2>
              <button type="button" onClick={() => setShowVersion(false)} aria-label={t.close} className="rounded p-1 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-700">{meta.rules_version}</p>
            <ul className="mt-4 space-y-3">
              {meta.amendments.map((a) => (
                <li key={a.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">
                    {a.effective_date_display} · Rule {a.rule_ref}
                  </p>
                  <p className="mt-1">{lang === 'hi' ? a.summary_hi : a.summary_en}</p>
                  <p className="mt-1 text-xs">
                    <a href={a.source_url} target="_blank" rel="noreferrer" className="underline">
                      {t.source}
                    </a>{' '}
                    · {a.gazette_reference}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Official text: <a className="underline" href="/pdf/en" target="_blank" rel="noreferrer">MP Bhumi Vikas Rules 2012 (EN)</a> ·{' '}
              <a className="underline" href="/pdf/hi" target="_blank" rel="noreferrer">हिंदी</a>
            </p>
          </div>
        </div>
      )}

      <Onboarding />
    </div>
  )
}
