// Infraestrutura das telas: chamadas à API, tempo real (SSE) e formatação.

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const dados = texto ? (JSON.parse(texto) as unknown) : null;
  if (!r.ok) throw new ErroApi(r.status, dados as ErroApi['dados']);
  return dados as T;
}

// ---------------- tempo real ----------------

let fonte: EventSource | null = null;
function fonteEventos(): EventSource {
  fonte ??= new EventSource('/api/eventos');
  return fonte;
}

/** Chama `fn` a cada aviso do servidor do tipo dado. */
export function useEvento<T>(tipo: string, fn: (dados: T) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = fonteEventos();
    const ouvir = (e: MessageEvent) => ref.current(JSON.parse(e.data) as T);
    f.addEventListener(tipo, ouvir);
    return () => f.removeEventListener(tipo, ouvir);
  }, [tipo]);
}

/** Busca `caminho` e busca de novo quando chega um aviso de algum dos `tipos` (e a cada `intervaloMs`, se dado). */
export function useDados<T>(caminho: string | null, tipos: string[] = [], intervaloMs?: number) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<ErroApi | Error | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useCallback(() => {
    if (!caminho) return;
    api<T>(caminho).then(
      (d) => {
        setDados(d);
        setErro(null);
      },
      (e: Error) => setErro(e),
    );
  }, [caminho]);

  useEffect(() => {
    setDados(null);
    recarregar();
    if (!intervaloMs) return;
    const relogio = setInterval(recarregar, intervaloMs);
    return () => clearInterval(relogio);
  }, [recarregar, intervaloMs]);

  const agendar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(recarregar, 250);
  }, [recarregar]);

  useEffect(() => {
    const f = fonteEventos();
    for (const t of tipos) f.addEventListener(t, agendar);
    return () => {
      for (const t of tipos) f.removeEventListener(t, agendar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendar, tipos.join(',')]);

  return { dados, erro, recarregar };
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

export function fmtHora(ms: number | null | undefined, idioma: Idioma): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat(LOCALE[idioma], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ms);
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
