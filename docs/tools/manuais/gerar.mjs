/* Gera os manuais em PDF (com o HTML intermediário) a partir dos .md em docs/.
 *   node docs/tools/manuais/gerar.mjs [termo ...]     (na raiz: npm run manuais [-- termo ...])
 * Sem termos, gera todos os manuais da lista MANUAIS; com termos, só aqueles cujo nome do PDF ou do HTML contém
 * algum deles (ex.: `npm run manuais -- instrumentos`).
 * Saída: PDF em docs/pdf/ (é o que se entrega, vai no git) e HTML em docs/tools/manuais/out/ (intermediário,
 * fora do git). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(AQUI, '..', '..');
const pdfDir = path.join(docsDir, 'pdf');
const outDir = path.join(AQUI, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(pdfDir, { recursive: true });

// Um manual por entrada: md (fonte), html (intermediário), pdf (nome de entrega), capa (título, subtítulo, kicker)
// e, opcional, ficha: true (manual curto; ver build.mjs).
const MANUAIS = [
  {
    md: path.join(docsDir, 'instrumentos.md'),
    html: path.join(outDir, 'instrumentos.html'),
    pdf: path.join(pdfDir, 'AUPRO4000 - Manual dos instrumentos.pdf'),
    titulo: 'Manual dos instrumentos',
    subtitulo: 'Sensores e atuadores da bancada AUPRO4000 (P&ID versão 2): o que é cada um, onde fica e como o sinal chega ao CLP',
    kicker: 'Ficha técnica',
    ficha: true, // manual curto: sem sumário, capítulos seguidos, miolo de no máximo 2 páginas
  },
  {
    md: path.join(docsDir, 'guia-aula.md'),
    html: path.join(outDir, 'guia-aula.html'),
    pdf: path.join(pdfDir, 'AUPRO4000 - Guia da aula.pdf'),
    titulo: 'Guia da aula',
    subtitulo: 'Loja e MES da bancada AUPRO4000: preparar, fazer os pedidos, acompanhar a produção e ler os resultados',
    kicker: 'Guia rápido',
    ficha: true,
  },
];

function rodar(script, args) {
  const r = spawnSync(process.execPath, [path.join(AQUI, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const filtros = process.argv.slice(2);
const selecionados = filtros.length
  ? MANUAIS.filter((m) => filtros.some((f) => path.basename(m.pdf).includes(f) || path.basename(m.html).includes(f)))
  : MANUAIS;
if (!selecionados.length) {
  console.error(`Nenhum manual corresponde a: ${filtros.join(', ')}`);
  process.exit(1);
}

for (const m of selecionados) {
  rodar('build.mjs', [m.md, m.html, m.titulo, m.subtitulo, m.kicker, m.ficha ? 'ficha' : 'manual']);
  rodar('print.mjs', [m.html, m.pdf]);
}

console.log(`\nConcluído. PDFs em ${path.relative(path.join(docsDir, '..'), pdfDir)}${path.sep}.`);
