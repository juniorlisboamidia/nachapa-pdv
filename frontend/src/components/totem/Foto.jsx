import { useState } from 'react'
import { Ico } from './icones'

// Foto de produto ou de opção. O cardápio do Cardápio Web nem sempre tem imagem,
// e a URL que tem pode falhar no meio do expediente — nos dois casos o card não
// pode desabar nem mostrar um quadro cinza sem explicação: entra o marcador
// desenhado, do mesmo tamanho, para a grade não ficar torta.
//
// O estado local aqui é o único permitido num componente de tela: "a imagem
// quebrou" é efeito visual, descartável, e não pertence ao orquestrador.
export default function Foto({ src, alt = '', className, tamIcone = 44 }) {
  const [quebrou, setQuebrou] = useState(false)
  const classe = 'tq-foto' + (className ? ' ' + className : '')
  if (!src || quebrou) {
    return (
      <div className={classe + ' tq-foto-vazia'} aria-hidden="true">
        <Ico nome="semFoto" tam={tamIcone} traco={1.6} />
      </div>
    )
  }
  return <img className={classe} src={src} alt={alt} loading="lazy" onError={() => setQuebrou(true)} />
}
