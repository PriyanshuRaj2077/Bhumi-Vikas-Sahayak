import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
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
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width) - 8)))
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

  // scroll the first highlight into view once the text layer is drawn
  const onTextLayer = useCallback(() => {
    const m = box.current?.querySelector('mark')
    m?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={t.pdfTitle}>
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">{t.pdfTitle}</span>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold" role="radiogroup">
          {(['en', 'hi'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={doc === l}
              onClick={() => setDoc(l)}
              className={`rounded px-2 py-0.5 ${doc === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              {l === 'en' ? 'EN' : 'हिं'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded p-1 hover:bg-slate-100" aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <span className="tabular-nums text-slate-600">
            {t.page} {page}
            {numPages ? ` / ${numPages}` : ''}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(numPages || p + 1, p + 1))} className="rounded p-1 hover:bg-slate-100" aria-label="Next page">
            <ChevronRight size={18} />
          </button>
          <a href={`/pdf/${doc}#page=${page}`} target="_blank" rel="noreferrer" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Open in new tab">
            <ExternalLink size={16} />
          </a>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t.close}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      {target?.label && (
        <div className="border-b border-slate-100 bg-saffron-400/10 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {target.label} · {t.page} {target.page}
          {doc === 'hi' && <span className="font-normal text-slate-500"> · Hindi page numbers may differ slightly</span>}
        </div>
      )}
      <div ref={box} className="flex-1 overflow-auto bg-slate-100 p-1">
        {!target ? (
          <p className="p-6 text-center text-sm text-slate-500">{t.pdfHint}</p>
        ) : (
          <Document
            file={`/pdf/${doc}`}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={<div className="p-6"><Spinner label={t.loadingPdf} /></div>}
          >
            <Page
              pageNumber={page}
              width={width}
              renderAnnotationLayer={false}
              customTextRenderer={renderText}
              onRenderTextLayerSuccess={onTextLayer}
              loading={<div className="p-6"><Spinner label={t.loadingPdf} /></div>}
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
