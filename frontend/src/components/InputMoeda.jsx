import { useEffect, useState } from 'react'
import { mascaraMoeda, parseMoeda, numeroParaMascara } from '../utils/moeda'

// Input de moeda BR: o usuário digita só dígitos e a vírgula entra sozinha
// (centavos). `valor` é o número no estado do form (ou ''/null quando vazio);
// `onChange` recebe o número (ou '' quando o campo fica vazio). Demais props
// (className, placeholder, disabled, etc.) são repassadas ao <input>.
export default function InputMoeda({ valor, onChange, ...rest }) {
  const [txt, setTxt] = useState(() => numeroParaMascara(valor))

  // Sincroniza com mudanças externas (abrir modal de edição, reset do form) sem
  // atrapalhar a digitação: só reescreve quando o número efetivo difere.
  useEffect(() => {
    const nAtual = parseMoeda(txt)
    const vazioAtual = Number.isNaN(nAtual)
    const vazioAlvo = valor === '' || valor == null || Number.isNaN(Number(valor))
    if (vazioAtual && vazioAlvo) return
    if (!vazioAtual && !vazioAlvo && nAtual === Number(valor)) return
    setTxt(numeroParaMascara(valor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  return (
    <input
      type="text"
      inputMode="numeric"
      value={txt}
      onChange={(e) => {
        const m = mascaraMoeda(e.target.value)
        setTxt(m)
        onChange(m === '' ? '' : parseMoeda(m))
      }}
      {...rest}
    />
  )
}
