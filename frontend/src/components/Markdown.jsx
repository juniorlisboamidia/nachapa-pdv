// Renderizador de Markdown leve (zero-dep). Cobre o que usamos nos artigos da
// Central de Ajuda: títulos, negrito/itálico, código inline, listas, citações,
// links e linha horizontal. Constrói elementos React (sem dangerouslySetInnerHTML),
// então é seguro contra injeção — links só expõem o href.

const INLINE_RE = /\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\[(.+?)\]\((.+?)\)|\*(.+?)\*|_(.+?)_/g

function renderInline(text, keyPrefix) {
  const out = []
  let last = 0
  let idx = 0
  let m
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-i${idx++}`
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>)
    else if (m[3] !== undefined) out.push(<code key={key} className="md-code">{m[3]}</code>)
    else if (m[4] !== undefined) {
      const href = m[5]
      const externo = /^https?:\/\//i.test(href)
      out.push(
        <a key={key} href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noreferrer' : undefined}>{m[4]}</a>
      )
    }
    else if (m[6] !== undefined) out.push(<em key={key}>{m[6]}</em>)
    else if (m[7] !== undefined) out.push(<em key={key}>{m[7]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function parseBlocos(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n')
  const blocos = []
  let para = []
  const flush = () => { if (para.length) { blocos.push({ type: 'p', text: para.join(' ') }); para = [] } }
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (t === '') { flush(); i++; continue }
    if (/^###\s+/.test(t)) { flush(); blocos.push({ type: 'h3', text: t.replace(/^###\s+/, '') }); i++; continue }
    if (/^##\s+/.test(t)) { flush(); blocos.push({ type: 'h2', text: t.replace(/^##\s+/, '') }); i++; continue }
    if (/^#\s+/.test(t)) { flush(); blocos.push({ type: 'h1', text: t.replace(/^#\s+/, '') }); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocos.push({ type: 'hr' }); i++; continue }
    if (/^>\s?/.test(t)) {
      flush()
      const itens = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { itens.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      blocos.push({ type: 'quote', text: itens.join(' ') })
      continue
    }
    if (/^[-*]\s+/.test(t)) {
      flush()
      const itens = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { itens.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++ }
      blocos.push({ type: 'ul', itens })
      continue
    }
    if (/^\d+\.\s+/.test(t)) {
      flush()
      const itens = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { itens.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i++ }
      blocos.push({ type: 'ol', itens })
      continue
    }
    para.push(t)
    i++
  }
  flush()
  return blocos
}

export default function Markdown({ children, className }) {
  const blocos = parseBlocos(children)
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocos.map((b, idx) => {
        const k = `b${idx}`
        switch (b.type) {
          case 'h1': return <h2 key={k} className="md-h1">{renderInline(b.text, k)}</h2>
          case 'h2': return <h3 key={k} className="md-h2">{renderInline(b.text, k)}</h3>
          case 'h3': return <h4 key={k} className="md-h3">{renderInline(b.text, k)}</h4>
          case 'hr': return <hr key={k} className="md-hr" />
          case 'quote': return <blockquote key={k} className="md-quote">{renderInline(b.text, k)}</blockquote>
          case 'ul': return <ul key={k} className="md-ul">{b.itens.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ul>
          case 'ol': return <ol key={k} className="md-ol">{b.itens.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ol>
          default: return <p key={k} className="md-p">{renderInline(b.text, k)}</p>
        }
      })}
    </div>
  )
}
