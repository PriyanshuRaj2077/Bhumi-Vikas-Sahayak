import { BookOpen, Calculator, CalendarClock, ExternalLink, FileText, Moon, ShieldCheck, Sparkles, Sun, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { getMeta, type Meta } from './api'
import { AskView } from './components/AskView'
import { BrowseRules } from './components/BrowseRules'
import { Spinner, type PdfTarget } from './components/common'
import { BhumiLogoMark } from './components/Logo'
import { Onboarding } from './components/Onboarding'
import { PlotCheck } from './components/PlotCheck'
import { useI18n } from './i18n'
import { useTheme } from './theme'

const PdfPane = lazy(() => import('./components/PdfPane'))

type Tab = 'ask' | 'plot' | 'browse'

export default function App() {
  const { t, lang, setLang } = useI18n()
  const { theme, toggleTheme } = useTheme()
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
    ['ask', t.tabAsk, Sparkles],
    ['plot', t.tabPlot, Calculator],
    ['browse', t.tabBrowse, BookOpen],
  ]

  const tabTitles: Record<Tab, { title: string; sub: string }> = {
    ask: {
      title: lang === 'hi' ? 'एआई नियम सहायक' : 'AI Regulatory Desk',
      sub: lang === 'hi' ? 'सरल भाषा में पूछें — नियम व पृष्ठ संख्या के साथ उत्तर' : 'Ask natural language questions · Verified from official MP gazette tables',
    },
    plot: {
      title: lang === 'hi' ? 'भूखंड गणना कैलकुलेटर' : 'Plot Compliance Calculator',
      sub: lang === 'hi' ? 'सीमांत खुले स्थान, ऊँचाई, एफ.ए.आर. एवं शुल्क की सीधी गणना' : 'Instant deterministic setback, height, FAR & fee calculations',
    },
    browse: {
      title: lang === 'hi' ? 'समस्त 106 नियम निर्देशिका' : 'MP Bhumi Vikas Rules (106 Rules)',
      sub: lang === 'hi' ? 'राजपत्र के अध्यायों एवं पृष्ठों के अनुसार आधिकारिक पाठ' : 'Explore full statutory text grouped by Part with direct PDF page coordinates',
    },
  }

  return (
    <div className={`min-h-screen bg-[var(--color-page-bg)] text-[var(--color-ink)] flex flex-col transition-colors duration-200 ${lang === 'hi' ? 'hi' : ''}`}>
      {/* Outer Framed Campus-Connect Portal Container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full min-h-screen overflow-x-hidden">
        
        {/* Campus Connect Left Sidebar */}
        <aside className="no-print w-full lg:w-64 shrink-0 bg-[var(--color-surface-side)] border-b lg:border-b-0 lg:border-r border-[var(--color-border)] flex flex-col justify-between p-5 lg:p-6 shadow-[inset_-1px_0_0_var(--color-border-subtle)] z-30 transition-colors duration-200">
          <div>
            {/* Logo Row */}
            <div className="flex items-center gap-3 pb-6 border-b border-[var(--color-border-subtle)]">
              <div className="relative rounded-2xl shadow-[0_6px_16px_rgba(239,123,69,0.28)] transition-transform duration-200 hover:scale-105">
                <BhumiLogoMark size={42} />
              </div>
              <div className="min-w-0">
                <h1 className="font-heading font-extrabold text-[17px] text-[var(--color-ink)] leading-tight tracking-tight">
                  {t.appName}
                </h1>
                <p className="text-[11px] font-bold text-[var(--color-ink-muted)] tracking-tight flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#5BA869]" />
                  <span>{t.desk}</span>
                </p>
              </div>
            </div>

            {/* Menu Label */}
            <div className="hidden lg:block font-mono text-[10px] text-[var(--color-ink-light)] tracking-widest uppercase px-2 mb-2 mt-5 font-bold">
              Services
            </div>

            {/* Sidebar Navigation Items */}
            <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0" aria-label="Sidebar Menu">
              {tabs.map(([id, label, Icon]) => {
                const isActive = tab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setTab(id)
                      if (id === 'browse') setRule(null)
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-[16px] text-[13.5px] font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-[var(--color-orange-tint)] text-[var(--color-orange-text)] font-extrabold shadow-2xs border-l-4 border-l-[#EF7B45]'
                        : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-[#EF7B45] group-hover:scale-110 transition-transform' : 'text-[var(--color-ink-light)] group-hover:text-[var(--color-ink)]'} aria-hidden />
                    <span>{label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Bottom Counter User / Authority Card */}
          <div className="hidden lg:flex items-center gap-3 p-3 rounded-[18px] bg-[var(--color-user-card)] border border-[var(--color-border)] mt-auto transition-colors">
            <div className="w-9 h-9 rounded-full bg-[#5BA869] text-white font-heading font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
              MP
            </div>
            <div className="min-w-0">
              <p className="font-bold text-xs text-[var(--color-ink)] truncate">Bhopal Municipal Desk</p>
              <p className="text-[10px] text-[var(--color-ink-muted)] truncate font-semibold">Madhya Pradesh Gov</p>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace with Campus-Connect Mesh Background */}
        <div className="flex-1 flex flex-col min-w-0 campus-mesh">
          
          {/* Topbar with Liquid Glass Backdrop Filter */}
          <header className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[var(--color-surface)]/80 dark:bg-[var(--color-surface)]/85 backdrop-blur-xl border-b border-[var(--color-border)] transition-colors">
            <div className="min-w-0">
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-[var(--color-ink)] leading-tight">
                {tabTitles[tab].title}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5 hidden sm:block">
                {tabTitles[tab].sub}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              {meta && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    meta.ai_available
                      ? 'border-[#5BA869]/30 bg-[#E9F3EA] dark:bg-[#5BA869]/15 text-[#2D6934] dark:text-[#8BE09B]'
                      : 'border-[var(--color-border)] bg-[var(--color-user-card)] text-[var(--color-ink-muted)]'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${meta.ai_available ? 'bg-[#5BA869] animate-pulse' : 'bg-slate-400'}`} />
                  <span className="hidden sm:inline">{meta.ai_available ? t.aiOn : t.aiOff}</span>
                </span>
              )}

              {meta?.eval && (
                <span
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)] shadow-2xs"
                  title={meta.eval.label}
                >
                  <ShieldCheck size={14} className="text-[#5BA869]" aria-hidden />
                  <span>{meta.eval.correct}/{meta.eval.total}</span>
                  <span className="text-[var(--color-ink-light)]">{t.tested}</span>
                </span>
              )}

              {meta && (
                <button
                  type="button"
                  onClick={() => setShowVersion(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)] shadow-2xs hover:border-[var(--color-orange)] transition"
                >
                  <CalendarClock size={14} className="text-[#EF7B45]" aria-hidden />
                  <span>06-03-2025</span>
                  {meta.amendments.length ? (
                    <span className="rounded-full bg-[var(--color-orange-tint)] px-1.5 py-0.2 text-[10px] font-bold text-[var(--color-orange-text)]">
                      +{meta.amendments.length}
                    </span>
                  ) : null}
                </button>
              )}

              {/* Day/Night Theme Switcher Button */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} mode`}
                className="theme-toggle-btn"
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} mode`}
              >
                {theme === 'light' ? (
                  <>
                    <Moon size={14} className="text-[#B83807]" aria-hidden />
                    <span className="hidden sm:inline text-xs font-bold">Dark</span>
                  </>
                ) : (
                  <>
                    <Sun size={14} className="text-[#F5C13D]" aria-hidden />
                    <span className="hidden sm:inline text-xs font-bold">Light</span>
                  </>
                )}
              </button>

              {/* Language Switcher Pill */}
              <div className="flex rounded-full border border-[var(--color-border)] bg-[var(--color-user-card)] p-0.5 text-xs font-bold" role="radiogroup" aria-label="Language">
                {(['en', 'hi'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={lang === l}
                    onClick={() => setLang(l)}
                    className={`rounded-full px-3 py-1 transition-all duration-150 cursor-pointer ${
                      lang === l
                        ? 'bg-[var(--color-surface)] text-[var(--color-orange-text)] font-extrabold shadow-2xs'
                        : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    {l === 'en' ? 'EN' : 'हिं'}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Main Body Workspace */}
          <main className="flex-1 p-4 sm:p-6 lg:p-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
            </div>

            {/* Desktop Side Gazette PDF Pane */}
            <div className="no-print hidden lg:block">
              <div className="sticky top-[5.75rem] h-[calc(100vh-7.5rem)]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center rounded-[20px] border border-[rgba(58,42,36,0.1)] bg-white shadow-card">
                      <Spinner label={t.loadingPdf} />
                    </div>
                  }
                >
                  <PdfPane target={pdf} />
                </Suspense>
              </div>
            </div>
          </main>

          {/* Bottom Footer */}
          <footer className="no-print border-t border-[var(--color-border)] bg-[var(--color-surface)]/70 py-4 px-6 text-xs text-[var(--color-ink-muted)] backdrop-blur-md transition-colors">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <p className="font-medium text-center sm:text-left text-[var(--color-ink-muted)]">
                {t.disclaimer}
              </p>
              <div className="flex items-center gap-3 font-semibold text-[var(--color-ink)]">
                <button
                  type="button"
                  onClick={() => setShowVersion(true)}
                  className="hover:text-[var(--color-orange)] transition cursor-pointer"
                >
                  {t.rulesVersion}
                </button>
                <span className="text-[var(--color-ink-light)]">·</span>
                <a
                  href="/pdf/en"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--color-orange)] transition inline-flex items-center gap-1"
                >
                  MP Rules 2012 (EN) <ExternalLink size={11} />
                </a>
                <span className="text-[var(--color-ink-light)]">·</span>
                <a
                  href="/pdf/hi"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--color-orange)] transition inline-flex items-center gap-1"
                >
                  राजपत्र (हिंदी) <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile PDF Overlay Drawer */}
      {pdf && pdfOpenMobile && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-2 lg:hidden">
          <div className="h-full">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center rounded-[20px] bg-[var(--color-surface)]">
                  <Spinner label={t.loadingPdf} />
                </div>
              }
            >
              <PdfPane target={pdf} onClose={() => setPdfOpenMobile(false)} />
            </Suspense>
          </div>
        </div>
      )}
      {pdf && !pdfOpenMobile && (
        <button
          type="button"
          onClick={() => setPdfOpenMobile(true)}
          className="no-print fixed bottom-5 right-5 z-40 btn-primary shadow-xl lg:hidden"
        >
          <FileText size={15} aria-hidden /> PDF p.{pdf.page}
        </button>
      )}

      {/* Rules Version & Amendments Modal */}
      {showVersion && meta && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowVersion(false)}
        >
          <div
            className="rise w-full max-w-xl campus-card p-6 sm:p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[var(--color-border)] pb-4">
              <div>
                <h3 className="font-heading font-extrabold text-xl text-[var(--color-ink)]">{t.rulesVersion}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--color-orange)]">
                  Madhya Pradesh Urban Development & Housing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVersion(false)}
                aria-label={t.close}
                className="rounded-full p-1.5 text-[var(--color-ink-light)] hover:bg-[var(--color-surface-side)] hover:text-[var(--color-ink)] transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm text-[var(--color-ink-muted)] leading-relaxed">{meta.rules_version}</p>
            <div className="mt-4 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
              <ul className="space-y-3">
                {meta.amendments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-[16px] border border-[var(--color-yellow-tint)] bg-[var(--color-yellow-tint)] p-4 text-sm text-[var(--color-ink)]"
                  >
                    <p className="font-bold text-[var(--color-yellow-text)]">
                      {a.effective_date_display} · Rule {a.rule_ref}
                    </p>
                    <p className="mt-1 text-[var(--color-ink-muted)]">{lang === 'hi' ? a.summary_hi : a.summary_en}</p>
                    <p className="mt-2 text-xs text-[var(--color-ink-light)]">
                      <a
                        href={a.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-[var(--color-yellow-text)] underline hover:text-[var(--color-ink)]"
                      >
                        {t.source}
                      </a>{' '}
                      · {a.gazette_reference}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-ink-muted)]">
              Official gazette text:{' '}
              <a className="font-bold text-[var(--color-green-text)] underline" href="/pdf/en" target="_blank" rel="noreferrer">
                MP Bhumi Vikas Rules 2012 (English)
              </a>{' '}
              ·{' '}
              <a className="font-bold text-[var(--color-green-text)] underline" href="/pdf/hi" target="_blank" rel="noreferrer">
                राजपत्र (हिंदी)
              </a>
            </div>
          </div>
        </div>
      )}

      <Onboarding />
    </div>
  )
}
