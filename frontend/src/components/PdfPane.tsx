import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import { useI18n } from '../i18n'
import { Spinner, type PdfTarget } from './common'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

interface Props {
  target: PdfTarget | null
  onClose?: () => void
}

export default function PdfPane({ target, onClose }: Props) {
  const { t } = useI18n()
  const [doc, setDoc] = useState<'en' | 'hi'>('en')
  const [page, setPage] = useState(target?.page ?? 1)
  const [numPages, setNumPages] = useState(0)
  const [width, setWidth] = useState(520)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (target) {
      setPage(target.page)
      if (target.lang) setDoc(target.lang)
    }
  }, [target])

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width) - 16)))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const quote = target?.quote && doc === 'en' && page === target.page ? norm(target.quote) : ''
  const renderText = useCallback(
    ({ str }: { str: string }) => {
      const s = norm(str)
      if (quote && s.length >= 4 && /[a-z0-9]/.test(s) && quote.includes(s)) return `<mark>${escapeHtml(str)}</mark>`
      return escapeHtml(str)
    },
    [quote],
  )

  const onTextLayer = useCallback(() => {
    const m = box.current?.querySelector('mark')
    m?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  return (
    <aside className="campus-card flex h-full flex-col overflow-hidden" aria-label={t.pdfTitle}>
      {/* Top Document Bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FileText size={15} className="text-[var(--color-orange)]" aria-hidden />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-ink)] font-heading">{t.pdfTitle}</span>
          <div className="flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-side)] p-0.5 text-xs font-bold" role="radiogroup">
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={doc === l}
                onClick={() => setDoc(l)}
                className={`rounded-full px-2.5 py-0.5 transition cursor-pointer ${
                  doc === l ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-2xs font-extrabold border border-[var(--color-border)]' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-side)] hover:text-[var(--color-ink)] transition cursor-pointer"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-mono text-xs font-bold text-[var(--color-ink)]">
            {page}
            {numPages ? ` / ${numPages}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages || p + 1, p + 1))}
            className="rounded-full p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-side)] hover:text-[var(--color-ink)] transition cursor-pointer"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
          <a
            href={`/pdf/${doc}#page=${page}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full p-1 text-[var(--color-ink-light)] hover:bg-[var(--color-surface-side)] hover:text-[var(--color-ink)] transition"
            aria-label="Open in new tab"
          >
            <ExternalLink size={14} />
          </a>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-[var(--color-ink-light)] hover:bg-[var(--color-surface-side)] hover:text-[var(--color-ink)] transition cursor-pointer"
              aria-label={t.close}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Target Citation Anchor Label */}
      {target?.label && (
        <div className="flex items-center justify-between border-b border-[var(--color-orange)]/20 bg-[var(--color-orange-tint)] px-4 py-2 text-xs font-bold text-[var(--color-orange-text)]">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-orange)]" />
            <span>{target.label} · {t.page} {target.page}</span>
          </div>
          {doc === 'hi' && <span className="text-[11px] font-normal opacity-80">Hindi pages may vary slightly</span>}
        </div>
      )}

      {/* Document View Area */}
      <div ref={box} className="flex-1 overflow-auto bg-[var(--color-input)] p-2 custom-scrollbar">
        {!target ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <FileText size={32} className="text-[var(--color-ink-light)]/40 mb-2" />
            <p className="text-xs font-semibold text-[var(--color-ink-light)] max-w-xs leading-relaxed">
              {t.pdfHint}
            </p>
          </div>
        ) : (
          <Document
            file={`/pdf/${doc}`}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={
              <div className="flex h-full items-center justify-center p-8">
                <Spinner label={t.loadingPdf} />
              </div>
            }
          >
            <Page
              pageNumber={page}
              width={width}
              renderAnnotationLayer={false}
              customTextRenderer={renderText}
              onRenderTextLayerSuccess={onTextLayer}
              loading={
                <div className="flex h-64 items-center justify-center">
                  <Spinner label={t.loadingPdf} />
                </div>
              }
            />
          </Document>
        )}
      </div>
    </aside>
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
