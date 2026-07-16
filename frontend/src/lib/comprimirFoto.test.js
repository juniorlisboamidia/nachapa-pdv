// Testa só a lógica de escala (pura). A parte de canvas roda no navegador.
// Rodar: node src/lib/comprimirFoto.test.js
import { dimensoesComprimidas } from './comprimirFoto.js';
let ok = 0, fail = 0;
const t = (n, real, esp) => { if (JSON.stringify(real) === JSON.stringify(esp)) { ok++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALHA ${n}: ${JSON.stringify(real)} != ${JSON.stringify(esp)}`); } };

t('menor que o teto nao muda', dimensoesComprimidas(800, 600, 1280), { largura: 800, altura: 600 });
t('paisagem escala pela largura', dimensoesComprimidas(4000, 3000, 1280), { largura: 1280, altura: 960 });
t('retrato escala pela altura', dimensoesComprimidas(3000, 4000, 1280), { largura: 960, altura: 1280 });
t('quadrado no teto', dimensoesComprimidas(2560, 2560, 1280), { largura: 1280, altura: 1280 });
t('exatamente no teto nao muda', dimensoesComprimidas(1280, 720, 1280), { largura: 1280, altura: 720 });
t('arredonda pra inteiro', dimensoesComprimidas(1281, 721, 1280), { largura: 1280, altura: 720 });

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
