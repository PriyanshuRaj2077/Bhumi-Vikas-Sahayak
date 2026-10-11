export type Lang = 'en' | 'hi'

export interface Fact {
  key: string
  label: string
  label_hi: string
  display: string
  rule: string
  sub_rule: string
  page: number
  value: number | string | null
  unit: string
  row_label: string
  source: string
  quote: string
  notes: string[]
  edge_case: boolean
  status: 'ok' | 'not_applicable' | 'not_eligible' | 'info'
  citation: string
  pdf_url: string
}

export interface Citation {
  n: number
  rule: string
  sub_rule: string
  title: string
  page: number | null
  quote: string
  pdf_url: string | null
  hi_pdf_url: string | null
  amendment_id: string | null
}

export interface AmendmentBanner {
  id: string
  rule_ref: string
  date: string
  summary: string
  source_url: string
  gazette_reference: string
}

export interface Answer {
  id: string
  status: 'answered' | 'not_found' | 'rule' | 'error'
  lang: Lang
  mode: 'ai' | 'offline' | 'rules'
  answer_md: string
  not_found_reason?: string
  facts: Fact[]
  citations: Citation[]
  amendments: AmendmentBanner[]
  warnings: string[]
  unverified_numbers: string[]
  confidence: 'high' | 'check'
  rules_version: string
  disclaimer: string
  latency_ms?: number
  rule?: string
  message?: string
}

export interface AskHandlers {
  onStart?: (e: { id: string; lang: Lang; facts_detected: Record<string, number>; personal_masked: boolean }) => void
  onDelta?: (text: string) => void
  onDeltaReset?: () => void
  onTool?: (e: { name: string; facts: Fact[]; error: boolean }) => void
  onNotice?: (message: string) => void
  onFinal: (a: Answer) => void
  onError: (message: string) => void
}

export async function ask(question: string, lang: Lang | 'auto', h: AskHandlers, signal?: AbortSignal) {
  let res: Response
  try {
    res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, lang }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') h.onError('Cannot reach the server.')
    return
  }
  if (!res.ok || !res.body) {
    h.onError(res.status === 422 ? 'Please type a longer question.' : `Server error (${res.status}).`)
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let gotFinal = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        let event = 'message'
        let data = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7)
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        if (!data) continue
        const payload = JSON.parse(data)
        if (event === 'start') h.onStart?.(payload)
        else if (event === 'delta') h.onDelta?.(payload.text)
        else if (event === 'delta_reset') h.onDeltaReset?.()
        else if (event === 'tool') h.onTool?.(payload)
        else if (event === 'notice') h.onNotice?.(payload.message)
        else if (event === 'final') {
          gotFinal = true
          if (payload.status === 'error') h.onError(payload.message)
          else h.onFinal(payload)
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') h.onError('The connection was interrupted.')
    return
  }
  if (!gotFinal && !signal?.aborted) h.onError('No answer received. Please try again.')
}

export interface PlotInput {
  plot_area_sqm: number
  street_width_m: number
  frontage_m?: number | null
  height_m?: number | null
  use: string
  building_type?: string | null
  built_up_sqm?: number | null
  commercial_category?: string | null
}

export async function plotCheck(input: PlotInput): Promise<{ facts: Fact[]; hints: string[]; rules_version: string }> {
  const res = await fetch('/api/plot-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Please check the inputs.')
  }
  return res.json()
}

export interface RuleSummary {
  rule: string
  title: string
  part: string
  page_start: number
  page_end: number
  amended_later: boolean
}

export interface RuleDetail extends RuleSummary {
  text: string
  comments: string[]
  amendments: { kind: string; notification: string; date: string }[]
  later_amendments: { id: string; rule_ref: string; effective_date_display: string; summary_en: string; summary_hi: string; source_url: string }[]
  pages: { offset: number; page: number }[]
}

export const getRules = (): Promise<RuleSummary[]> => fetch('/api/rules').then((r) => r.json())
export const getRule = (id: string): Promise<RuleDetail> =>
  fetch(`/api/rules/${encodeURIComponent(id)}`).then((r) => {
    if (!r.ok) throw new Error('not found')
    return r.json()
  })

export interface Meta {
  rules_version: string
  amendments: { id: string; rule_ref: string; effective_date_display: string; summary_en: string; summary_hi: string; source_url: string; gazette_reference: string }[]
  ai_available: boolean
  eval: { total: number; correct: number; label: string; mode: 'ai' | 'offline' } | null
  stats: { questions: number; feedback_correct: number; feedback_wrong: number }
  recent: { id: string; question: string; status: string; rules: string[]; lang: Lang }[]
}

export const getMeta = (): Promise<Meta> => fetch('/api/meta').then((r) => r.json())

export const sendFeedback = (id: string, verdict: 'correct' | 'wrong', note = '') =>
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, verdict, note }),
  })
