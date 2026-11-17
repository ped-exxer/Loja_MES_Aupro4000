// Infraestrutura das telas: chamadas à API, tempo real (SSE) e formatação.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LOCALE, type Idioma } from './idioma.ts';

// ---------------- API ----------------

export class ErroApi extends Error {
  readonly status: number;
  readonly dados: { erro?: string; erros?: { campo: string; codigo: string }[] } | null;
  constructor(status: number, dados: ErroApi['dados']) {
    super(dados?.erro ?? `HTTP ${status}`);
    this.status = status;
    this.dados = dados;
  }
}

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  const r = await fetch(caminho, {
    method: opcoes.metodo ?? (opcoes.corpo === undefined ? 'GET' : 'POST'),
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON (um proxy, uma página de erro): vale só o status
  }
  if (!r.ok) throw new ErroApi(r.status, dados as ErroApi['dados']);
  return dados as T;
}

// ---------------- tempo real ----------------

let fonte: EventSource | null = null;
let conectado = true;
const ouvintesConexao = new Set<() => void>();
/** Quem ouve cada tipo de aviso. Fica aqui, e não só no EventSource, para valer também na conexão refeita. */
const ouvintes = new Map<string, Set<(e: MessageEvent) => void>>();
/** Espera antes de abrir outra conexão quando o navegador desiste da que caiu. */
const REABRE_MS = 2000;

function fonteEventos(): EventSource {
  if (fonte) return fonte;
  const f = new EventSource('/api/eventos');
  fonte = f;
  const mudar = (v: boolean) => {
    if (conectado === v) return;
    conectado = v;
    for (const o of ouvintesConexao) o();
  };
  f.addEventListener('open', () => mudar(true));
  f.addEventListener('error', () => {
    mudar(false);
    // Queda de rede: o EventSource reconecta sozinho. Resposta de erro (um proxy devolvendo 502 enquanto o servidor
    // reinicia): ele desiste de vez (CLOSED); aí a conexão é aberta de novo daqui, com os mesmos ouvintes.
    if (f.readyState !== EventSource.CLOSED || fonte !== f) return;
    fonte = null;
    setTimeout(() => {
      if (!fonte) fonteEventos();
    }, REABRE_MS);
  });
  for (const [tipo, fns] of ouvintes) for (const fn of fns) f.addEventListener(tipo, fn);
  return f;
}

/** Ouve os avisos de um tipo (na conexão de agora e nas que forem abertas depois); devolve a função que para de ouvir. */
function ouvir(tipo: string, fn: (e: MessageEvent) => void): () => void {
  let fns = ouvintes.get(tipo);
  if (!fns) ouvintes.set(tipo, (fns = new Set()));
  fns.add(fn);
  fonteEventos().addEventListener(tipo, fn);
  return () => {
    fns.delete(fn);
    fonte?.removeEventListener(tipo, fn);
  };
}

/** Verdadeiro enquanto o canal de avisos do servidor (SSE) está aberto. */
export function useConexao(): boolean {
  return useSyncExternalStore(
    (aviso) => {
      fonteEventos();
      ouvintesConexao.add(aviso);
      return () => ouvintesConexao.delete(aviso);
    },
    () => conectado,
  );
}

/** Fora de um componente: chama `fn` a cada aviso do tipo dado; devolve a função que para de ouvir. */
export function ouvirEvento<T>(tipo: string, fn: (dados: T) => void): () => void {
  return ouvir(tipo, (e) => fn(JSON.parse(e.data) as T));
}

/** Chama `fn` a cada aviso do servidor do tipo dado. */
export function useEvento<T>(tipo: string, fn: (dados: T) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ouvir(tipo, (e) => ref.current(JSON.parse(e.data) as T)), [tipo]);
}

/**
 * Busca `caminho` e busca de novo quando chega um aviso de algum dos `tipos` (e a cada `intervaloMs`, se dado) ou
 * quando a conexão com o servidor volta. Um erro numa atualização não apaga os dados já mostrados.
 */
export function useDados<T>(caminho: string | null, tipos: string[] = [], intervaloMs?: number) {
  const [estado, setEstado] = useState<{ caminho: string | null; dados: T | null; erro: ErroApi | Error | null }>({ caminho, dados: null, erro: null });
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vigente = useRef(caminho);
  vigente.current = caminho;
  /** Buscas numeradas: a resposta de uma busca mais antiga que chega depois de uma mais nova não vale. */
  const pedido = useRef(0);
  const aplicado = useRef(0);

  const recarregar = useCallback(() => {
    if (!caminho) return Promise.resolve();
    const n = ++pedido.current;
    const vale = () => {
      if (n < aplicado.current || vigente.current !== caminho) return false;
      aplicado.current = n;
      return true;
    };
    return api<T>(caminho).then(
      (d) => {
        if (vale()) setEstado({ caminho, dados: d, erro: null });
      },
      (e: Error) => {
        if (vale()) setEstado((a) => ({ caminho, dados: a.caminho === caminho ? a.dados : null, erro: e }));
      },
    );
  }, [caminho]);

  useEffect(() => {
    void recarregar();
    if (!intervaloMs) return;
    const relogio = setInterval(recarregar, intervaloMs);
    return () => clearInterval(relogio);
  }, [recarregar, intervaloMs]);

  const agendar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(recarregar, 250);
  }, [recarregar]);

  useEffect(() => {
    const parar = tipos.map((t) => ouvir(t, agendar));
    return () => {
      for (const p of parar) p();
      if (espera.current) clearTimeout(espera.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendar, tipos.join(',')]);

  // a conexão voltou: o que mudou enquanto ela esteve fora não foi avisado
  const noAr = useConexao();
  const antes = useRef(noAr);
  useEffect(() => {
    if (noAr && !antes.current) void recarregar();
    antes.current = noAr;
  }, [noAr, recarregar]);

  // dados de outro caminho (a rota mudou) não valem para este
  const doCaminho = estado.caminho === caminho;
  return { dados: doCaminho ? estado.dados : null, erro: doCaminho ? estado.erro : null, recarregar };
}

// ---------------- formatação ----------------

export function fmtNum(v: number | null | undefined, idioma: Idioma, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(LOCALE[idioma], { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}

export function fmtPct(v: number | null | undefined, idioma: Idioma): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat(LOCALE[idioma], { style: 'percent', maximumFractionDigits: 1 }).format(v);
}

export function fmtMoeda(v: number, idioma: Idioma): string {
  return new Intl.NumberFormat(LOCALE[idioma], { style: 'currency', currency: 'BRL' }).format(v);
}

export function fmtHora(ms: number | null | undefined, idioma: Idioma, segundos = true): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat(LOCALE[idioma], { hour: '2-digit', minute: '2-digit', second: segundos ? '2-digit' : undefined }).format(ms);
}

export function fmtDataHora(ms: number | null | undefined, idioma: Idioma): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat(LOCALE[idioma], { dateStyle: 'short', timeStyle: 'medium' }).format(ms);
}

export function fmtDuracao(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
