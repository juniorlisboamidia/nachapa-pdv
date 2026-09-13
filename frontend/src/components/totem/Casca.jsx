import { useEffect, useRef } from 'react'
import { PROPRIEDADES, propriedadesDe } from '../totemTema'
// Raiz do quiosque. Existe para que TODA saída de TotemQuiosque (carregando,
// bloqueio, tela cheia) use a mesma casca, em vez de repetir a `div` da raiz em
// cada `return` — era assim que a tela antiga fazia, e cada cópia era uma chance
// de esquecer uma regra de fundo, fonte ou rolagem.
//
// A partir da V11 não há mais convivência: o bloco `.ttm-*` do quiosque saiu do
// global.css e a casca é só `.tq-raiz`. O que sobrou de `.ttm-` no global.css
// pertence às telas de escritório (Totem › Pedidos e › Apresentação).
//
// `position: relative` é o que ancora o que flutua dentro do quiosque — aviso
// passageiro, sobreposição de envio e o alerta de inatividade.
export default function Casca({ children, tokens, posicaoCategorias = 'esquerda' }) {
  const raizRef = useRef(null)

  // As cores do canal entram por CSSOM, uma propriedade de cada vez, e só as seis que o
  // mapa conhece. Sem `<style>` montada com string e sem `dangerouslySetInnerHTML`: não
  // há texto sendo interpretado como CSS, então não há escape a fazer.
  //
  // `removeProperty` antes de escrever é o que faz a loja conseguir VOLTAR: sem isso, tirar
  // um override no admin deixaria a cor antiga grudada até alguém recarregar o tablet.
  useEffect(() => {
    const el = raizRef.current
    if (!el) return
    const pares = propriedadesDe(tokens)
    const escritas = new Set(pares.map(([p]) => p))
    for (const prop of Object.values(PROPRIEDADES)) {
      if (!escritas.has(prop)) el.style.removeProperty(prop)
    }
    for (const [prop, valor] of pares) el.style.setProperty(prop, valor)
  }, [tokens])

  // A posição das categorias vira ATRIBUTO, e o CSS decide o resto. Nada de JSX duplicado
  // nem de ordem de elementos trocada no React: a árvore é uma só, e quem inverte é uma
  // regra de layout.
  return <div className="tq-raiz" ref={raizRef} data-posicao-categorias={posicaoCategorias}>{children}</div>
}
