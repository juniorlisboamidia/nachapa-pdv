// Avaliação pública (cliente) — aberta pelo link/QR. Sem sidebar/Layout.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

function Estrelas({ valor, onChange, tamanho = 30 }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="aval-estrelas" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={'aval-estrela' + ((hover || valor) >= n ? ' on' : '')}
          style={{ fontSize: tamanho }}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function AvaliacaoPublica() {
  const { token } = useParams()
  const [estado, setEstado] = useState('loading') // loading | erro | form | enviado
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null) // { empresa, campanha }
  const [notaGeral, setNotaGeral] = useState(0)
  const [notasCat, setNotasCat] = useState({})
  const [comentario, setComentario] = useState('')
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  useEffect(() => {
    api
      .get(`/public/avaliacao/${token}`)
      .then((r) => {
        setDados(r.data)
        if (r.data.campanha.ativa) {
          setEstado('form')
        } else {
          setErro('Esta avaliação não está mais recebendo respostas.')
          setEstado('erro')
        }
      })
      .catch((e) => {
        setErro(e?.response?.data?.error ?? 'Avaliação não encontrada.')
        setEstado('erro')
      })
  }, [token])

  async function enviar() {
    setErroForm('')
    if (notaGeral < 1) return setErroForm('Dê uma nota geral de 1 a 5 estrelas.')
    if (!nome.trim()) return setErroForm('Informe seu nome.')
    if (!whatsapp.replace(/\D/g, '')) return setErroForm('Informe seu WhatsApp.')
    setEnviando(true)
    try {
      await api.post(`/public/avaliacao/${token}`, { notaGeral, notasCategorias: notasCat, comentario, nome, whatsapp, email })
      setEstado('enviado')
    } catch (e) {
      setErroForm(e?.response?.data?.error ?? 'Não foi possível enviar. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pub-page">
      <div className="pub-card">
        {estado === 'loading' && <div className="pub-instrucao" style={{ textAlign: 'center' }}>Carregando…</div>}

        {estado === 'erro' && (
          <div className="pub-erro">
            <div className="pub-erro-titulo">Ops…</div>
            <div className="pub-erro-msg">{erro}</div>
          </div>
        )}

        {estado === 'enviado' && (
          <div className="pub-sucesso">
            <div className="pub-sucesso-icone">✓</div>
            <div className="pub-sucesso-titulo">Obrigado pela avaliação!</div>
            <div className="pub-sucesso-msg">Seu feedback foi enviado com sucesso.</div>
          </div>
        )}

        {estado === 'form' && dados && (
          <>
            <div className="pub-header">
              <div className="pub-empresa">{dados.empresa.nome}</div>
              <div className="pub-titulo">Avalie sua experiência</div>
            </div>

            <div className="aval-bloco aval-bloco-geral">
              <label className="aval-label">Nota geral</label>
              <Estrelas valor={notaGeral} onChange={setNotaGeral} />
            </div>

            {dados.campanha.categorias.length > 0 && (
              <div className="aval-categorias">
                {dados.campanha.categorias.map((cat) => (
                  <div key={cat} className="aval-bloco-cat">
                    <span className="aval-label">{cat}</span>
                    <Estrelas valor={notasCat[cat] ?? 0} onChange={(n) => setNotasCat((p) => ({ ...p, [cat]: n }))} tamanho={22} />
                  </div>
                ))}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Comentário (opcional)</label>
              <textarea
                className="form-input"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Conte como foi sua experiência…"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="pub-form">
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">E-mail (opcional)</label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
            </div>

            {erroForm && <div className="pub-erro-msg" style={{ color: '#dc2626', textAlign: 'left', margin: '4px 0 0' }}>{erroForm}</div>}

            <button type="button" className="btn btn-primary pub-enviar" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar avaliação'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
