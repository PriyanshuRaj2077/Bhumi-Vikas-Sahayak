import type { Citation, Fact } from '../api'
import { useI18n } from '../i18n'

interface Props {
  question: string
  answerLine?: string
  facts: Fact[]
  citations: Citation[]
  rulesVersion: string
  disclaimer: string
}

/** A5 black-and-white slip for the citizen. Rendered only when printing. No personal fields. */
export function PrintSlip({ question, answerLine, facts, citations, rulesVersion, disclaimer }: Props) {
  const { lang, t } = useI18n()
  const now = new Date()
  const stamp = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const quotes = citations.filter((c) => c.quote).slice(0, 3)
  return (
    <div className="print-only text-[11px] leading-normal text-black font-sans">
      {/* Header */}
      <div className="flex items-baseline justify-between border-b-2 border-black pb-1.5">
        <strong className="text-[13px] tracking-wide">
          {t.appName.toUpperCase()} · {t.slipTitle}
        </strong>
        <span className="font-mono text-[10px]">{stamp}</span>
      </div>

      {/* Query & Quick Answer */}
      <div className="mt-2.5">
        <p>
          <strong className="font-bold">{t.question}:</strong> {question}
        </p>
        {answerLine ? <p className="mt-1 font-semibold text-[11.5px]">{answerLine}</p> : null}
      </div>

      {/* Facts Table */}
      {facts.length > 0 && (
        <div className="mt-2.5">
          <table className="w-full border-collapse text-[10.5px]">
            <tbody>
              {facts.map((f) => (
                <tr key={f.key + f.citation} className="border-b border-dotted border-black/70">
                  <td className="py-1 pr-3 align-top font-medium">{lang === 'hi' ? f.label_hi || f.label : f.label}</td>
                  <td className="py-1 pr-3 align-top font-bold text-black">{f.display}</td>
                  <td className="py-1 text-right align-top font-mono text-[9.5px] text-black/80">
                    {f.citation}, PDF p.{f.page}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quotes / Citations */}
      {quotes.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {quotes.map((c) => (
            <p key={c.n} className="font-mono text-[9.5px] leading-snug">
              “{c.quote.replace(/\s+/g, ' ').slice(0, 240)}” (Rule {c.rule}
              {c.sub_rule}
              {c.page ? `, p.${c.page}` : ''})
            </p>
          ))}
        </div>
      )}

      {/* Footer & Disclaimer */}
      <div className="mt-3.5 border-t border-black pt-1.5 text-[9.5px] leading-tight text-black/90">
        <p className="font-medium">
          {t.rulesVersion}: MP Bhumi Vikas Rules 2012, {rulesVersion}
        </p>
        <p className="mt-0.5 italic">{disclaimer}</p>
        <p className="mt-0.5 font-mono text-[9px]">Official text: mptownplan.gov.in/NewsPDF/bvn06032025E.pdf</p>
      </div>
    </div>
  )
}
