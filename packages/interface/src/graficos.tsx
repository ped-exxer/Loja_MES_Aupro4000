// Gráficos em SVG, sem biblioteca: curvas no tempo (um painel por grandeza, todos no mesmo eixo de tempo) e o anel
// de porcentagem. Um eixo por painel: temperatura (°C) e nível (L) não dividem a mesma escala.

import { useEffect, useRef, useState } from 'react';
import { useIdioma } from './idioma.ts';
import { fmtHora, fmtNum, fmtPct } from './infra.ts';

export type Serie = {
  nome: string;
  cor: string;
  unidade: string;
  /** [horário em ms, valor] */
  pontos: [number, number][];
  /** Linha de referência (o valor pedido), com o rótulo dela. */
  meta?: { valor: number; rotulo: string };
  casas?: number;
};

export const COR_TEMPERATURA = 'var(--cor-temperatura)';
export const COR_NIVEL = 'var(--cor-nivel)';

/** Largura real do elemento: o SVG é desenhado em pixels de tela, para o texto não encolher no celular. */
function useLargura(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    const medir = () => setLargura(Math.round(e.clientWidth));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(e);
    return () => observador.disconnect();
  }, []);
  return [ref, largura];
}

/** Marcas "redondas" (1, 2, 5 × 10ⁿ) cobrindo de `min` a `max`. */
function marcas(min: number, max: number, quantas = 4): number[] {
  const bruto = (max - min) / quantas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  const lista: number[] = [];
  for (let v = Math.floor(min / passo) * passo; v <= max + passo * 0.999; v += passo) lista.push(Math.round(v * 1e6) / 1e6);
  return lista;
}

/** Curvas no tempo: um painel por série, empilhados, com o mesmo eixo de tempo e a leitura sob o cursor. */
export function Grafico({ series, altura = 150 }: { series: Serie[]; altura?: number }) {
  const { t, idioma } = useIdioma();
  const [ref, largura] = useLargura();
  const [cursor, setCursor] = useState<number | null>(null);
  const todos = series.flatMap((s) => s.pontos);
  const vazio = todos.length < 2;

  const m = { e: 46, d: 16, c: 10, b: 8 };
  const x0 = vazio ? 0 : Math.min(...todos.map((p) => p[0]));
  const x1 = vazio ? 1 : Math.max(...todos.map((p) => p[0]));
  const util = Math.max(1, largura - m.e - m.d);
  const escalaX = (x: number) => m.e + ((x - x0) / Math.max(1, x1 - x0)) * util;
  const horario = cursor === null ? null : x0 + ((cursor - m.e) / util) * (x1 - x0);
  const maisPerto = (pontos: [number, number][]) =>
    horario === null || pontos.length === 0 ? null : pontos.reduce((a, p) => (Math.abs(p[0] - horario) < Math.abs(a[0] - horario) ? p : a));

  return (
    <div className="grafico" ref={ref}>
      {vazio ? (
        <div className="grafico-vazio">{t.grafico.semDados}</div>
      ) : (
        largura > 0 && (
          <div
            className="grafico-paineis"
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
              setCursor(Math.min(largura - m.d, Math.max(m.e, x)));
            }}
            onPointerLeave={() => setCursor(null)}
          >
            {series.map((s) => {
              const ys = s.pontos.map((p) => p[1]);
              if (s.meta) ys.push(s.meta.valor);
              let y0 = Math.min(...ys);
              let y1 = Math.max(...ys);
              if (y1 - y0 < 1) {
                // série parada: abre a escala em volta do valor, sem descer abaixo de zero (nível e pressão não são negativos)
                const piso = y0 >= 0 ? 0 : Number.NEGATIVE_INFINITY;
                y0 = Math.max(piso, y0 - 0.5);
                y1 = y0 + Math.max(1, y1 - y0 + 0.5);
              }
              const ms = marcas(y0, y1);
              y0 = ms[0];
              y1 = ms[ms.length - 1];
              const base = altura - m.b;
              const escalaY = (y: number) => base - ((y - y0) / (y1 - y0)) * (base - m.c);
              const linha = s.pontos.map((p, j) => `${j === 0 ? 'M' : 'L'}${escalaX(p[0]).toFixed(1)},${escalaY(p[1]).toFixed(1)}`).join(' ');
              const ultimo = s.pontos[s.pontos.length - 1];
              const primeiro = s.pontos[0];
              const area = `${linha} L${escalaX(ultimo[0]).toFixed(1)},${base} L${escalaX(primeiro[0]).toFixed(1)},${base} Z`;
              const sob = maisPerto(s.pontos);
              const casas = s.casas ?? 1;
              return (
                <figure key={s.nome} className="grafico-painel">
                  <figcaption>
                    <span className="grafico-nome">
                      <i style={{ background: s.cor }} /> {s.nome} <span className="suave">({s.unidade})</span>
                    </span>
                    <span className="grafico-atual">
                      <span className="suave">{fmtHora((sob ?? ultimo)[0], idioma)}</span>{' '}
                      <strong>{fmtNum((sob ?? ultimo)[1], idioma, casas)} {s.unidade}</strong>
                    </span>
                  </figcaption>
                  <svg
                    width={largura}
                    height={altura}
                    role="img"
                    aria-label={`${s.nome}: ${fmtNum(Math.min(...s.pontos.map((p) => p[1])), idioma, casas)}–${fmtNum(Math.max(...s.pontos.map((p) => p[1])), idioma, casas)} ${s.unidade}; ${fmtHora(ultimo[0], idioma)}: ${fmtNum(ultimo[1], idioma, casas)} ${s.unidade}`}
                  >
                    {ms.map((v) => (
                      <g key={v}>
                        <line x1={m.e} x2={largura - m.d} y1={escalaY(v)} y2={escalaY(v)} className={v === y0 ? 'grafico-eixo' : 'grafico-grade'} />
                        <text x={m.e - 8} y={escalaY(v) + 4} textAnchor="end" className="grafico-texto">{fmtNum(v, idioma, Number.isInteger(v) ? 0 : 1)}</text>
                      </g>
                    ))}
                    {s.meta && (
                      <g>
                        <line x1={m.e} x2={largura - m.d} y1={escalaY(s.meta.valor)} y2={escalaY(s.meta.valor)} className="grafico-meta" />
                        {/* o rótulo fica acima da linha; se ela está no alto do painel, abaixo */}
                        <text x={largura - m.d - 4} y={escalaY(s.meta.valor) + (escalaY(s.meta.valor) < m.c + 16 ? 14 : -5)} textAnchor="end" className="grafico-texto grafico-texto-meta">
                          {s.meta.rotulo} {fmtNum(s.meta.valor, idioma, casas)}
                        </text>
                      </g>
                    )}
                    <path d={area} fill={s.cor} opacity={0.12} />
                    <path d={linha} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {sob && cursor !== null ? (
                      <g>
                        <line x1={escalaX(sob[0])} x2={escalaX(sob[0])} y1={m.c} y2={base} className="grafico-cursor" />
                        <circle cx={escalaX(sob[0])} cy={escalaY(sob[1])} r={4.5} fill={s.cor} className="grafico-ponto" />
                      </g>
                    ) : (
                      <circle cx={escalaX(ultimo[0])} cy={escalaY(ultimo[1])} r={4.5} fill={s.cor} className="grafico-ponto" />
                    )}
                  </svg>
                </figure>
              );
            })}
            <div className="grafico-tempo" style={{ paddingLeft: m.e, paddingRight: m.d }} aria-hidden="true">
              <span>{fmtHora(x0, idioma)}</span>
              {largura > 420 && <span>{fmtHora((x0 + x1) / 2, idioma)}</span>}
              <span>{fmtHora(x1, idioma)}</span>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/** Anel de porcentagem (0 a 1) com o valor escrito no centro; `null` mostra "—". */
export function Anel({ valor, rotulo, tamanho = 180 }: { valor: number | null; rotulo: string; tamanho?: number }) {
  const { idioma } = useIdioma();
  const raio = 42;
  const volta = 2 * Math.PI * raio;
  const fracao = valor === null ? 0 : Math.min(1, Math.max(0, valor));
  return (
    <div className="anel" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`${rotulo}: ${fmtPct(valor, idioma)}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={raio} className="anel-trilho" />
        {fracao > 0 && (
          <circle cx="50" cy="50" r={raio} className="anel-valor" strokeDasharray={`${fracao * volta} ${volta}`} transform="rotate(-90 50 50)" />
        )}
      </svg>
      <div className="anel-centro">
        <span className="anel-numero">{fmtPct(valor, idioma)}</span>
        <span className="anel-rotulo">{rotulo}</span>
      </div>
    </div>
  );
}
