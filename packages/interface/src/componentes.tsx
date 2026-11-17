// Componentes pequenos reaproveitados pelas telas.

import type { ReactNode } from 'react';
import { useIdioma } from './idioma.ts';
import { ErroApi, fmtHora, fmtNum } from './infra.ts';
import type { EstadoOp } from './tipos.ts';

const TOM_ESTADO: Record<EstadoOp, string> = {
  na_fila: 'neutro',
  enviada: 'info',
  em_producao: 'info',
  produzida: 'atencao',
  aprovada: 'ok',
  reprovada: 'ruim',
  recusada: 'ruim',
  abortada: 'ruim',
  cancelada: 'neutro',
  comunicacao_perdida: 'ruim',
};

export function SeloEstado({ estado }: { estado: EstadoOp }) {
  const { t } = useIdioma();
  return <span className={`selo selo-${TOM_ESTADO[estado]}`}>{t.estadoOp[estado]}</span>;
}

export function Selo({ tom, children }: { tom: 'ok' | 'ruim' | 'atencao' | 'info' | 'neutro'; children: ReactNode }) {
  return <span className={`selo selo-${tom}`}>{children}</span>;
}

export function Carregando() {
  const { t } = useIdioma();
  return <p className="suave">{t.comum.carregando}</p>;
}

/** Mostra o erro de uma chamada, traduzindo os códigos de campo que a API devolve. */
export function MensagemErro({ erro }: { erro: unknown }) {
  const { t } = useIdioma();
  if (!erro) return null;
  if (erro instanceof ErroApi && erro.dados?.erros?.length) {
    return (
      <div className="aviso aviso-ruim" role="alert">
        <ul>
          {erro.dados.erros.map((e, i) => (
            <li key={i}>
              <code>{e.campo}</code>: {t.erros[e.codigo] ?? e.codigo}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const codigo = erro instanceof ErroApi ? erro.dados?.erro : undefined;
  const texto = (codigo && t.erros[codigo]) ?? (erro instanceof ErroApi ? t.comum.erro : t.comum.semResposta);
  return (
    <div className="aviso aviso-ruim" role="alert">
      {texto}
      {codigo && !t.erros[codigo] ? ` (${codigo})` : ''}
    </div>
  );
}

export function Cartao({ titulo, children, extra }: { titulo?: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="cartao">
      {(titulo || extra) && (
        <header className="cartao-topo">
          {titulo && <h2>{titulo}</h2>}
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

/** Um valor em destaque. `texto` para valores em palavras (fonte menor, quebra a linha). */
export function Numero({ rotulo, valor, unidade, texto }: { rotulo: string; valor: string; unidade?: string; texto?: boolean }) {
  return (
    <div className={texto ? 'numero texto' : 'numero'}>
      <div className="numero-rotulo">{rotulo}</div>
      <div className="numero-valor">
        {valor}
        {unidade && <span className="numero-unidade"> {unidade}</span>}
      </div>
    </div>
  );
}

type Serie = { nome: string; cor: string; pontos: [number, number][]; unidade: string };

/** Gráfico de linhas simples em SVG; cada série com a própria escala (eixo à esquerda e à direita). */
export function Grafico({ series, altura = 200 }: { series: Serie[]; altura?: number }) {
  const { idioma } = useIdioma();
  const todos = series.flatMap((s) => s.pontos);
  if (todos.length < 2) return <div className="grafico-vazio suave">—</div>;
  const largura = 640;
  const m = { e: 44, d: 44, c: 12, b: 26 };
  const x0 = Math.min(...todos.map((p) => p[0]));
  const x1 = Math.max(...todos.map((p) => p[0]));
  const escalaX = (x: number) => m.e + ((x - x0) / Math.max(1, x1 - x0)) * (largura - m.e - m.d);

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={series.map((s) => s.nome).join(', ')}>
        <line x1={m.e} y1={altura - m.b} x2={largura - m.d} y2={altura - m.b} className="grafico-eixo" />
        {series.map((s, i) => {
          const ys = s.pontos.map((p) => p[1]);
          let y0 = Math.min(...ys);
          let y1 = Math.max(...ys);
          if (y1 - y0 < 1) {
            y0 -= 0.5;
            y1 += 0.5;
          }
          const escalaY = (y: number) => altura - m.b - ((y - y0) / (y1 - y0)) * (altura - m.b - m.c);
          const d = s.pontos.map((p, j) => `${j === 0 ? 'M' : 'L'}${escalaX(p[0]).toFixed(1)},${escalaY(p[1]).toFixed(1)}`).join(' ');
          const xRotulo = i === 0 ? m.e - 6 : largura - m.d + 6;
          const ancora = i === 0 ? 'end' : 'start';
          return (
            <g key={s.nome}>
              <path d={d} fill="none" stroke={s.cor} strokeWidth={2} />
              <text x={xRotulo} y={escalaY(y1) + 4} textAnchor={ancora} className="grafico-texto" fill={s.cor}>
                {fmtNum(y1, idioma)}
              </text>
              <text x={xRotulo} y={escalaY(y0)} textAnchor={ancora} className="grafico-texto" fill={s.cor}>
                {fmtNum(y0, idioma)}
              </text>
            </g>
          );
        })}
        <text x={m.e} y={altura - 6} className="grafico-texto">{fmtHora(x0, idioma)}</text>
        <text x={largura - m.d} y={altura - 6} textAnchor="end" className="grafico-texto">{fmtHora(x1, idioma)}</text>
      </svg>
      <figcaption className="legenda">
        {series.map((s) => (
          <span key={s.nome}>
            <i style={{ background: s.cor }} /> {s.nome} ({s.unidade})
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export const COR_TEMPERATURA = 'var(--cor-temperatura)';
export const COR_NIVEL = 'var(--cor-nivel)';
