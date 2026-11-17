/* Imprime o HTML paginado (paged.js) em PDF com o Chrome ou o Edge já instalados.
 *   node print.mjs <entrada.html> <saida.pdf>
 * Sem dependências: fala com o navegador headless pelo protocolo DevTools (CDP), com o WebSocket do próprio Node
 * (Node 22+). No gerador da Plataforma Exxer isso era feito com puppeteer-core. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , htmlFile, pdfFile] = process.argv;
if (!htmlFile || !pdfFile) {
  console.error('Uso: node print.mjs <entrada.html> <saida.pdf>');
  process.exit(1);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function acharNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const achado = candidatos.find((p) => fs.existsSync(p));
  if (!achado) throw new Error('Chrome/Edge não encontrado. Defina a variável CHROME_PATH.');
  return achado;
}

/** Cliente CDP mínimo: send(método, parâmetros) devolve o resultado do comando. */
function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pendentes = new Map();
    let id = 0;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = msg.id && pendentes.get(msg.id);
      if (!p) return;
      pendentes.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.metodo}: ${msg.error.message}`));
      else p.resolve(msg.result);
    };
    ws.onerror = () => reject(new Error('Falha ao conectar ao navegador pelo DevTools.'));
    ws.onopen = () => resolve({
      send: (metodo, params = {}) => new Promise((res, rej) => {
        pendentes.set(++id, { resolve: res, reject: rej, metodo });
        ws.send(JSON.stringify({ id, method: metodo, params }));
      }),
      fechar: () => ws.close(),
    });
  });
}

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'manuais-pdf-'));
const navegador = spawn(acharNavegador(), [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank',
], { stdio: 'ignore' });

async function principal() {
  // o navegador escreve a porta do DevTools em <perfil>/DevToolsActivePort
  const arqPorta = path.join(perfil, 'DevToolsActivePort');
  let porta;
  for (let t = 0; t < 150 && !porta; t++) {
    if (fs.existsSync(arqPorta)) porta = fs.readFileSync(arqPorta, 'utf8').split('\n')[0].trim() || undefined;
    if (!porta) await espera(100);
  }
  if (!porta) throw new Error('O navegador não abriu a porta do DevTools.');

  const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
  const pagina = alvos.find((a) => a.type === 'page');
  if (!pagina) throw new Error('Nenhuma aba aberta no navegador headless.');
  const cdp = await conectar(pagina.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: pathToFileURL(path.resolve(htmlFile)).href });

  // espera o paged.js concluir a paginação (marca window.__pagedPronto, posta pelo build.mjs), com teto de 90 s
  const avaliar = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const inicio = Date.now();
  while (!(await avaliar('window.__pagedPronto === true'))) {
    if (Date.now() - inicio > 90000) throw new Error('O paged.js não terminou a paginação em 90 s.');
    await espera(250);
  }
  await avaliar('document.fonts.ready.then(() => true)');
  await espera(500);
  const paginas = await avaliar("document.querySelectorAll('.pagedjs_page').length");

  const { stream } = await cdp.send('Page.printToPDF', {
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    transferMode: 'ReturnAsStream',
  });
  const partes = [];
  for (;;) {
    const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
    partes.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
    if (r.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  cdp.fechar();

  fs.mkdirSync(path.dirname(path.resolve(pdfFile)), { recursive: true });
  fs.writeFileSync(pdfFile, Buffer.concat(partes));
  console.log('PDF gerado:', pdfFile, '-', paginas, 'páginas');
}

async function encerrar() {
  navegador.kill();
  // o Windows pode segurar o perfil por um instante depois de o navegador fechar
  for (let t = 0; t < 10; t++) {
    try { fs.rmSync(perfil, { recursive: true, force: true }); return; } catch { await espera(300); }
  }
}

principal()
  .then(encerrar)
  .catch(async (e) => { console.error(e.message || e); await encerrar(); process.exit(1); });
