/* Gera o HTML de um manual com a identidade visual Exxer a partir de um .md.
 *   node build.mjs <entrada.md> <saida.html> <titulo> <subtitulo> [kicker] [ficha]
 * Adaptado do gerador da Plataforma Exxer (docs/tools/manuais/build.js de lá). O HTML sai autossuficiente e
 * funciona offline: logos (identidade/), fontes (fonts/) e paged.js (vendor/) vão embutidos nele. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [, , mdPath, outHtml, docTitle, docSubtitle, edition, modo] = process.argv;
// "ficha": manual curto. Sem a página de abertura (Sobre + Sumário), capítulos seguidos na mesma página, sem
// número, e tabelas em letra menor. A introdução do .md vai no alto da primeira página do miolo.
const FICHA = modo === 'ficha';
if (!mdPath || !outHtml || !docTitle) {
  console.error('Uso: node build.mjs <entrada.md> <saida.html> <titulo> <subtitulo> [kicker]');
  process.exit(1);
}

const PURPLE = '#8036C5'; // Purple Robot (MIV 2023)
const TEAL = '#45C8BB';   // Blue Skill
const ORANGE = '#FF5C29'; // Electrical Orange
const GREY = '#F5F5F5';   // Smart Grey
const INK = '#1d1d24';

const imgDir = path.join(AQUI, 'identidade');
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(imgDir, f)).toString('base64');
const LOGO = dataUri('Exxer_roxa.png');
const SYMBOL = dataUri('xx_rx.png');

// paged.js 0.4.3 (MIT), guardado em vendor/ para gerar sem internet; vai inline no HTML.
const PAGED = fs.readFileSync(path.join(AQUI, 'vendor', 'paged.polyfill.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

/* Fontes do MIV em fonts/ (.ttf/.otf/.woff/.woff2), embutidas no HTML. "liber" no nome = fonte de títulos
 * (Liber Grotesque), "altone" = fonte de texto (Altone); o peso vem do sufixo do arquivo. Sem arquivos lá, o
 * manual cai em Segoe UI / Arial. */
const fontsDir = path.join(AQUI, 'fonts');
let fontCss = '';
let headFamily = null;
let bodyFamily = null;
const seenFamilies = [];
// pesos por sufixo do arquivo, incluindo abreviações (Bd, Blk, ExtLt, Nw, SmBd...)
const WEIGHTS = [
  [/^(thin|th|hairline)$/i, 100],
  [/^(extralight|extlt|exlt|ultralight|ul)$/i, 200],
  [/^(light|lt)$/i, 300],
  [/^(semilight|semlt|smlt)$/i, 350],
  [/^(regular|news|nw|book|normal|)$/i, 400],
  [/^(medium|md)$/i, 500],
  [/^(semibold|sembd|smbd|demibold|demi)$/i, 600],
  [/^(bold|bd)$/i, 700],
  [/^(extrabold|extbd|exbd|ultrabold)$/i, 800],
  [/^(black|blk|heavy|hv)$/i, 900],
];
if (fs.existsSync(fontsDir)) {
  for (const f of fs.readdirSync(fontsDir).filter((x) => /\.(ttf|otf|woff2?)$/i.test(x))) {
    const base = f.replace(/\.(ttf|otf|woff2?)$/i, '');
    // ignora fontes variáveis (VF): as estáticas cobrem os pesos necessários
    if (/(^|[-_ ])vf$/i.test(base)) continue;
    const dash = base.lastIndexOf('-');
    const family = (dash > 0 ? base.slice(0, dash) : base).replace(/[-_]+/g, ' ').trim();
    let suffix = dash > 0 ? base.slice(dash + 1) : '';
    const style = /obl(ique)?|italic|it$/i.test(suffix) ? 'oblique' : 'normal';
    if (style !== 'normal') continue; // manuais não usam itálico; economiza espaço
    suffix = suffix.replace(/obl(ique)?|italic|it$/gi, '');
    let weight = 400;
    for (const [re, w] of WEIGHTS) if (re.test(suffix)) { weight = w; break; }
    const ext = f.split('.').pop().toLowerCase();
    const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
    const fmt = ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'otf' ? 'opentype' : 'truetype';
    const b64 = fs.readFileSync(path.join(fontsDir, f)).toString('base64');
    fontCss += `@font-face{font-family:'${family}';src:url(data:${mime};base64,${b64}) format('${fmt}');font-weight:${weight};font-style:normal;}\n`;
    if (!seenFamilies.includes(family)) seenFamilies.push(family);
    if (/liber/i.test(family)) headFamily = family;
    if (/altone/i.test(family)) bodyFamily = family;
  }
  if (!headFamily && seenFamilies.length) headFamily = seenFamilies[0];
  if (!bodyFamily && seenFamilies.length) bodyFamily = seenFamilies[seenFamilies.length - 1];
}
const headStack = (headFamily ? `'${headFamily}',` : '') + "'Segoe UI',Arial,sans-serif";
const bodyStack = (bodyFamily ? `'${bodyFamily}',` : '') + "'Segoe UI',Arial,sans-serif";

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(s) {
  // trechos `código` ficam de fora das demais regras (ex.: `**texto**` sai literal)
  const codes = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'); // links -> texto puro
  // palavra curta com hífen (tags como LSH-101, TE-104a, S7-1200, azul-escuro) não quebra no hífen
  t = t.replace(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu, (w) => (w.length <= 16 ? `<span class="nq">${w}</span>` : w));
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`);
}

// ---------- parse ----------
const raw = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');

const intro = []; // parágrafos antes do primeiro ##
const chapters = []; // {title, blocks:[{type,...}]}
let cur = null;
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  if (/^# /.test(line)) { i++; continue; }

  if (/^## /.test(line)) {
    // o gerador numera os capítulos; remove numeração manual do .md ("1. Listar…")
    cur = { title: line.slice(3).trim().replace(/^\d+[.)]\s+/, ''), blocks: [] };
    chapters.push(cur);
    i++; continue;
  }

  if (/^### /.test(line)) {
    if (cur) cur.blocks.push({ type: 'h3', text: line.slice(4).trim() });
    i++; continue;
  }

  // subtítulo dentro de uma seção (#### no .md): sem número e fora do sumário
  if (/^#### /.test(line)) {
    if (cur) cur.blocks.push({ type: 'h4', text: line.slice(5).trim() });
    i++; continue;
  }

  // bloco de código cercado por ```
  if (/^```/.test(line)) {
    const lang = line.slice(3).trim();
    const code = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
    i++; // consome a cerca de fechamento
    const blk = { type: 'code', lang, text: code.join('\n') };
    if (cur) cur.blocks.push(blk); else intro.push(blk);
    continue;
  }

  if (/^\s*$/.test(line)) { i++; continue; }

  // imagem sozinha na linha: ![legenda](caminho relativo ao .md) vira figura com legenda
  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
  if (img) {
    const blk = { type: 'img', alt: img[1].trim(), src: path.resolve(path.dirname(mdPath), img[2].trim()) };
    if (cur) cur.blocks.push(blk); else intro.push(blk);
    i++; continue;
  }

  // tabela
  if (/^\|/.test(line)) {
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) {
      const cells = lines[i].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (!/^:?-{2,}/.test(cells[0])) rows.push(cells);
      i++;
    }
    const blk = { type: 'table', rows };
    if (cur) cur.blocks.push(blk); else intro.push(blk);
    continue;
  }

  // lista (com aninhamento por indentação de 2 espaços)
  if (/^(\s*)-\s+/.test(line) || /^(\s*)\d+\.\s+/.test(line)) {
    // lista numerada vira <ol>, mantendo o número inicial (passos interrompidos por tabela)
    const start = (line.match(/^\s*(\d+)\.\s+/) || [])[1];
    const items = [];
    while (i < lines.length && (/^(\s*)-\s+/.test(lines[i]) || /^(\s*)\d+\.\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
      const m = lines[i].match(/^(\s*)(?:-|\d+\.)\s+(.*)$/);
      // linha de continuação (item quebrado em várias linhas no .md): junta ao item anterior
      if (!m) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
      items.push({ depth: m[1].length >= 2 ? 1 : 0, text: m[2].trim() });
      i++;
    }
    const blk = { type: 'list', items, start: start ? Number(start) : null };
    if (cur) cur.blocks.push(blk); else intro.push(blk);
    continue;
  }

  // parágrafo (linhas consecutivas)
  let para = line.trim();
  i++;
  while (i < lines.length && lines[i].trim() && !/^(#|\||```|\s*-\s|\s*\d+\.\s)/.test(lines[i])) {
    para += ' ' + lines[i].trim();
    i++;
  }
  const blk = { type: 'p', text: para };
  if (cur) cur.blocks.push(blk); else intro.push(blk);
}

// remove capítulos de sumário do próprio md (o PDF gera o seu)
const content = chapters.filter(c => !/^sum[aá]rio$/i.test(c.title));

// ---------- render ----------
const CALLOUTS = [
  { re: /^(observa[çc][ãa]o|observa[çc][õo]es)\s*:?$/i, cls: 'info', label: 'Observação' },
  { re: /^(regra|regras|regra importante|regras importantes)\s*:?$/i, cls: 'warn', label: 'Regra' },
  { re: /^(boas pr[áa]ticas|uso recomendado)\s*:?$/i, cls: 'tip', label: 'Boa prática' },
  { re: /^(limites)\s*:?$/i, cls: 'warn', label: 'Limites' },
];

function calloutFor(text) {
  const t = text.trim();
  for (const c of CALLOUTS) if (c.re.test(t)) return c;
  return null;
}
function isLabel(text) {
  const t = text.trim();
  return /:$/.test(t) && t.length <= 60 && !/[.]/.test(t.slice(0, -1));
}

function renderList(items, start = null) {
  const tag = start ? 'ol' : 'ul';
  let html = start ? `<ol start="${start}">` : '<ul>';
  let open = false;
  for (const it of items) {
    // "- Nome: descrição" -> Nome em negrito (o nome pode ter `código`, como em "No `MB_Simulador`:")
    const m = it.text.match(/^([^:]{1,60}?):\s+(.*)$/);
    const nomeOk = m && (m[1].match(/`/g) || []).length % 2 === 0;
    const txt = nomeOk ? `<strong>${inline(m[1])}:</strong> ${inline(m[2])}` : inline(it.text);
    if (it.depth > 0) {
      if (!open) { html += '<ul>'; open = true; }
      html += `<li>${txt}</li>`;
    } else {
      if (open) { html += '</ul>'; open = false; }
      html += `<li>${txt}</li>`;
    }
  }
  if (open) html += '</ul>';
  return html + `</${tag}>`;
}

function renderCode(b) {
  const lang = b.lang ? `<div class="code-lang">${esc(b.lang)}</div>` : '';
  return `<div class="codeblock">${lang}<pre>${esc(b.text)}</pre></div>`;
}

// "Figura pendente: ..." (convenção da skill gerar-manuais) vira um quadro tracejado, para não passar por texto comum
function renderFiguraPendente(text) {
  return `<div class="fig-pendente"><span>Figura pendente</span>${inline(text.replace(/^figura pendente:\s*/i, ''))}</div>`;
}

// a imagem vai embutida em base64: o HTML continua autossuficiente
function renderImg(b) {
  const ext = path.extname(b.src).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  const uri = `data:${mime};base64,` + fs.readFileSync(b.src).toString('base64');
  const legenda = b.alt ? `<figcaption>${inline(b.alt)}</figcaption>` : '';
  return `<figure class="fig"><img src="${uri}" alt="${esc(b.alt)}">${legenda}</figure>`;
}

// tabela com muitas colunas (6 ou mais) sai em letra menor, para caber na largura da página
function renderTable(rows) {
  const larga = rows[0].length >= 6 ? ' class="larga"' : '';
  let html = `<table${larga}><thead><tr>`;
  html += rows[0].map(c => `<th>${inline(c)}</th>`).join('');
  html += '</tr></thead><tbody>';
  for (const r of rows.slice(1)) html += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
  return html + '</tbody></table>';
}

let usedCallout = false; // define o texto de abertura em "Sobre este documento"

function renderBlocks(blocks, chNum) {
  let html = '';
  let secNum = 0;
  let callout = null;

  const closeCallout = () => { if (callout) { html += '</div></div>'; callout = null; } };

  for (const b of blocks) {
    if (b.type === 'h3') {
      closeCallout();
      secNum++;
      const id = `sec-${chNum}-${secNum}`;
      b.id = id;
      b.num = `${chNum}.${secNum}`;
      html += `<h3 id="${id}"><span class="secnum">${b.num}</span> ${inline(b.text)}</h3>`;
    } else if (b.type === 'h4') {
      closeCallout();
      html += `<h4>${inline(b.text)}</h4>`;
    } else if (b.type === 'table') {
      closeCallout();
      html += renderTable(b.rows);
    } else if (b.type === 'code') {
      closeCallout();
      html += renderCode(b);
    } else if (b.type === 'img') {
      closeCallout();
      html += renderImg(b);
    } else if (b.type === 'p') {
      const co = calloutFor(b.text);
      if (co) {
        closeCallout();
        html += `<div class="callout ${co.cls}"><div class="callout-title">${co.label}</div><div class="callout-body">`;
        callout = co;
        usedCallout = true;
      } else if (/^figura pendente:/i.test(b.text)) {
        closeCallout();
        html += renderFiguraPendente(b.text);
      } else if (isLabel(b.text)) {
        closeCallout();
        html += `<p class="label">${inline(b.text.replace(/:$/, ''))}</p>`;
      } else {
        html += `<p>${inline(b.text)}</p>`;
      }
    } else if (b.type === 'list') {
      html += renderList(b.items, b.start);
      if (callout) { html += '</div></div>'; callout = null; }
    }
  }
  closeCallout();
  return html;
}

let bodyHtml = '';
content.forEach((ch, idx) => {
  const n = idx + 1;
  ch.id = `ch-${n}`;
  const inner = renderBlocks(ch.blocks, n);
  bodyHtml += `<section class="chapter">
  <h2 id="${ch.id}" class="chapter-title">${FICHA ? '' : `<span class="chnum">${String(n).padStart(2, '0')}</span>`}<span class="chname">${inline(ch.title)}</span></h2>
  ${inner}
</section>`;
});

// Sumário do PDF (com número de página via paged.js)
let tocHtml = '<nav class="toc"><h2 class="toc-title">Sumário</h2><ol class="toc-list">';
content.forEach((ch, idx) => {
  const n = idx + 1;
  tocHtml += `<li class="toc-ch"><a href="#${ch.id}"><span class="t-num">${String(n).padStart(2, '0')}</span><span class="t-text">${inline(ch.title)}</span><span class="t-dots"></span></a>`;
  const secs = ch.blocks.filter(b => b.type === 'h3');
  if (secs.length) {
    tocHtml += '<ol class="toc-sub">';
    for (const s of secs) {
      tocHtml += `<li><a href="#${s.id}"><span class="t-num">${s.num}</span><span class="t-text">${inline(s.text)}</span><span class="t-dots"></span></a></li>`;
    }
    tocHtml += '</ol>';
  }
  tocHtml += '</li>';
});
tocHtml += '</ol></nav>';

const introHtml = intro.map(b => {
  if (b.type === 'p') return `<p>${inline(b.text)}</p>`;
  if (b.type === 'list') return renderList(b.items, b.start);
  if (b.type === 'table') return renderTable(b.rows);
  if (b.type === 'code') return renderCode(b);
  if (b.type === 'img') return renderImg(b);
  return '';
}).join('\n');

const sobreTitulo = /manual/i.test(docTitle || '') ? 'Sobre este manual' : 'Sobre este documento';
const sobreParagrafo = usedCallout
  ? '<p>Utilize o sumário abaixo para localizar rapidamente o assunto desejado. Ao longo do documento, os quadros coloridos destacam observações, regras e boas práticas importantes.</p>'
  : '<p>Utilize o sumário abaixo para localizar rapidamente o assunto desejado.</p>';

const today = new Date();
const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const dateStr = `${months[today.getMonth()]} de ${today.getFullYear()}`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(docTitle)} — ${esc(docSubtitle || '')}</title>
<style>
${fontCss}
:root{
  --purple:${PURPLE}; --teal:${TEAL}; --orange:${ORANGE}; --grey:${GREY}; --ink:${INK};
}
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{ font-family:${bodyStack}; color:var(--ink); font-size:9.5pt; line-height:1.55; }
h1,h2,h3,h4,.chapter-title,.chnum,.chname,.toc-title,.about h2,.cover-title h1,.cover-title .kicker,.label{ font-family:${headStack}; }

@page{
  size:A4;
  margin:20mm 17mm 18mm 17mm;
  @bottom-left{ content:"exxer — Skills for the Future"; font-family:${bodyStack}; font-size:7pt; color:#9a9aa5; }
  @bottom-right{ content:counter(page); font-family:${bodyStack}; font-size:8pt; font-weight:600; color:${PURPLE}; }
  @top-right{ content:${FICHA ? JSON.stringify(docTitle) : 'string(chaptitle)'}; font-family:${bodyStack}; font-size:7pt; color:#9a9aa5; letter-spacing:.08em; text-transform:uppercase; }
}
@page cover{ margin:0; @bottom-left{content:none} @bottom-right{content:none} @top-right{content:none} }

.cover{ page:cover; width:210mm; height:296mm; position:relative; overflow:hidden; background:#fff; }
.cover-band{ position:absolute; left:0; top:0; width:8mm; height:100%; background:linear-gradient(180deg,var(--purple) 0%,var(--purple) 55%,var(--teal) 55%,var(--teal) 85%,var(--orange) 85%); }
.cover-logo{ position:absolute; top:22mm; left:24mm; width:62mm; }
.cover-title{ position:absolute; left:24mm; top:118mm; }
.cover-title .kicker{ color:var(--teal); font-weight:600; letter-spacing:.22em; text-transform:uppercase; font-size:10pt; margin-bottom:4mm; }
.cover-title h1{ color:var(--purple); font-size:34pt; font-weight:700; line-height:1.12; margin:0 0 6mm 0; max-width:150mm; }
.cover-title .subtitle{ color:#55555f; font-size:12.5pt; font-weight:400; max-width:140mm; }
.cover-footer{ position:absolute; left:24mm; bottom:18mm; color:#9a9aa5; font-size:9pt; }
.cover-footer b{ color:var(--purple); font-weight:600; }
.cover-x{ position:absolute; right:-30mm; top:-25mm; width:120mm; opacity:.07; }
.cover-x2{ position:absolute; right:18mm; bottom:16mm; width:26mm; }

.front{ page-break-after:always; }
.about h2, .toc-title{ color:var(--purple); font-size:16pt; font-weight:700; margin:0 0 5mm 0; }
.about{ margin-bottom:10mm; }
.about p{ color:#44444d; }

.toc-list, .toc-sub{ list-style:none; margin:0; padding:0; }
.toc-list > li{ margin-bottom:3.5mm; }
.toc a{ text-decoration:none; color:inherit; display:flex; align-items:baseline; gap:2.5mm; }
.toc-ch > a{ font-weight:600; color:var(--purple); font-size:10.5pt; }
.toc-sub{ margin:1.2mm 0 0 9mm; }
.toc-sub li{ margin-bottom:.8mm; }
.toc-sub a{ font-size:9pt; color:#44444d; }
.t-num{ min-width:8mm; color:var(--teal); font-weight:600; }
.toc-sub .t-num{ min-width:10mm; }
.t-dots{ flex:1; border-bottom:1px dotted #c6c6cf; margin:0 1mm; transform:translateY(-2px); }
.toc a::after{ content:target-counter(attr(href),page); font-weight:600; color:var(--purple); font-size:9pt; }
.toc-sub a::after{ font-weight:400; color:#7a7a85; }

${FICHA ? '' : '.chapter{ break-before:page; }'}
.chapter-title{ display:flex; align-items:center; gap:5mm; margin:0 0 7mm 0; padding-bottom:3.5mm; border-bottom:2.5pt solid var(--teal); }
.chnum{ font-size:26pt; font-weight:700; color:var(--teal); line-height:1; }
.chname{ font-size:17pt; font-weight:700; color:var(--purple); line-height:1.2; string-set:chaptitle content(text); }

h3{ font-size:11.5pt; font-weight:600; color:var(--purple); margin:7mm 0 2.5mm 0; break-after:avoid; }
h4{ font-size:10.5pt; font-weight:600; color:var(--purple); margin:5mm 0 2mm 0; break-after:avoid; }
.secnum{ color:var(--teal); font-weight:700; margin-right:1mm; }

p{ margin:0 0 2.8mm 0; }
.label{ font-size:8pt; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--orange); margin:4mm 0 1.5mm 0; break-after:avoid; }

ul{ margin:0 0 3mm 0; padding-left:5.5mm; }
li{ margin-bottom:1.1mm; }
li::marker{ color:var(--teal); }
ul ul{ margin:1mm 0 0 0; }
ol{ margin:0 0 3mm 0; padding-left:6mm; }
ol > li::marker{ color:var(--purple); font-weight:600; }
ol ul{ margin:1mm 0 0 0; }

code{ font-family:Consolas,monospace; font-size:8.5pt; background:var(--grey); border:1px solid #e4e4ea; border-radius:3px; padding:0 1.2mm; color:var(--purple); white-space:nowrap; }

.codeblock{ margin:2.5mm 0 4.5mm 0; background:var(--grey); border:1px solid #e4e4ea; border-left:1.2mm solid var(--teal); border-radius:2mm; overflow:hidden; break-inside:avoid; }
.code-lang{ font-family:${headStack}; font-size:6.5pt; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#9a9aa5; padding:1.6mm 3.5mm 0 3.5mm; }
.codeblock pre{ font-family:Consolas,monospace; font-size:8pt; line-height:1.5; margin:0; padding:1.6mm 3.5mm 2.4mm 3.5mm; white-space:pre-wrap; word-break:break-word; color:#33333c; }
.codeblock code{ background:none; border:none; padding:0; color:inherit; font-size:inherit; }

.nq{ white-space:nowrap; }
table{ width:100%; border-collapse:collapse; margin:3mm 0 5mm 0; font-size:9pt; }
tr{ break-inside:avoid; }
table.larga{ font-size:7.4pt; line-height:1.35; }
table.larga th{ padding:1.6mm 1.6mm; }
table.larga td{ padding:1.3mm 1.6mm; }
table.larga code{ font-size:7pt; padding:0 .6mm; }
.fig{ margin:3mm 0 5mm 0; break-inside:avoid; text-align:center; }
.fig img{ max-width:100%; max-height:105mm; border:1px solid #e4e4ea; border-radius:1.5mm; }
.fig figcaption{ margin-top:1.5mm; font-size:8.5pt; color:#6b6b78; }
.fig-pendente{ margin:3mm 0 5mm 0; padding:6mm 5mm; border:.4mm dashed #b9b9c4; border-radius:2mm; text-align:center; color:#6b6b78; font-size:9pt; break-inside:avoid; }
.fig-pendente span{ display:block; font-family:${headStack}; font-size:7.5pt; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#9a9aa5; margin-bottom:1.2mm; }
th{ background:var(--purple); color:#fff; text-align:left; font-weight:600; padding:2.2mm 3mm; }
th code{ color:var(--purple); }
td{ padding:2mm 3mm; border-bottom:1px solid #e4e4ea; vertical-align:top; }
tr:nth-child(even) td{ background:var(--grey); }

.callout{ border-radius:3mm; padding:3.2mm 4mm 2mm 4mm; margin:3mm 0 4mm 0; background:var(--grey); border:.3mm solid var(--purple); break-inside:avoid; }
.callout-title{ font-size:8pt; font-weight:700; letter-spacing:.1em; text-transform:uppercase; margin-bottom:1.2mm; }
.callout.info{ border-color:var(--teal); background:#eefaf8; }
.callout.info .callout-title{ color:#1e9a8d; }
.callout.warn{ border-color:var(--orange); background:#fff2ec; }
.callout.warn .callout-title{ color:#d84a1b; }
.callout.tip{ border-color:var(--purple); background:#f4ecfb; }
.callout.tip .callout-title{ color:var(--purple); }
.callout ul{ margin-bottom:1mm; }

.ficha .lead{ color:#44444d; margin:0 0 1mm 0; }
.ficha .chapter-title{ margin:4.5mm 0 2mm 0; padding-bottom:1.2mm; border-bottom-width:1.5pt; break-after:avoid; }
.ficha .chname{ font-size:12pt; }
.ficha p{ margin-bottom:1.5mm; }
.ficha table{ font-size:8pt; line-height:1.35; margin:1.5mm 0 0 0; }
.ficha th{ padding:1.4mm 2mm; }
.ficha td{ padding:1.15mm 2mm; }

.backcover{ page:cover; width:210mm; height:296mm; position:relative; background:var(--purple); break-before:page; }
.backcover img.logo{ position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:70mm; filter:brightness(0) invert(1); }
.backcover .site{ position:absolute; left:50%; bottom:24mm; transform:translateX(-50%); color:#fff; font-size:10pt; letter-spacing:.12em; }
</style>
<script>
// print.mjs espera esta marca para imprimir: o paged.js terminou de paginar.
window.PagedConfig = { after: () => { window.__pagedPronto = true; } };
</script>
<script>
${PAGED}
</script>
<script>
// Tabela que continua na página seguinte repete o cabeçalho. O paged.js reconstrói a tabela (vazia, marcada com
// data-split-from) no alto da página nova; antes da primeira linha entrar nela, põe-se uma cópia do <thead>.
// Como isso acontece durante a paginação, a altura do cabeçalho já conta para a quebra.
class CabecalhoRepetido extends Paged.Handler {
  renderNode(clone, node) {
    if (!clone || clone.nodeName !== 'TR' || !clone.closest) return;
    const tabela = clone.closest('table');
    if (!tabela || !tabela.hasAttribute('data-split-from') || tabela.querySelector(':scope > thead')) return;
    const thead = node.closest && node.closest('table') && node.closest('table').querySelector(':scope > thead');
    if (!thead || thead.contains(node)) return;
    const copia = thead.cloneNode(true);
    for (const el of [copia, ...copia.querySelectorAll('*')]) el.removeAttribute('data-ref');
    tabela.insertBefore(copia, tabela.firstChild);
  }
}
Paged.registerHandlers(CabecalhoRepetido);
</script>
</head>
<body${FICHA ? ' class="ficha"' : ''}>

<div class="cover">
  <div class="cover-band"></div>
  <img class="cover-x" src="${SYMBOL}" alt="">
  <img class="cover-logo" src="${LOGO}" alt="exxer — Skills for the Future">
  <div class="cover-title">
    <div class="kicker">${esc(edition || 'Documentação')}</div>
    <h1>${esc(docTitle)}</h1>
    <div class="subtitle">${esc(docSubtitle || '')}</div>
  </div>
  <img class="cover-x2" src="${SYMBOL}" alt="">
  <div class="cover-footer"><b>exxer.com</b> &nbsp;•&nbsp; ${dateStr}</div>
</div>

${FICHA ? `<div class="lead">${introHtml}</div>` : `<div class="front">
  <div class="about">
    <h2>${sobreTitulo}</h2>
    ${introHtml}
    ${sobreParagrafo}
  </div>
  ${tocHtml}
</div>`}

${bodyHtml}

<div class="backcover">
  <img class="logo" src="${LOGO}" alt="exxer">
  <div class="site">exxer.com</div>
</div>

</body>
</html>`;

fs.mkdirSync(path.dirname(outHtml), { recursive: true });
fs.writeFileSync(outHtml, html, 'utf8');
console.log('OK', outHtml, `(${content.length} capítulos)`);
