// Componentes reaproveitados pelas duas telas: ícones, botões, campos, avisos, diálogos, cartões, números, estados
// vazios e de carregamento. Os gráficos ficam em graficos.tsx.

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { useIdioma, type TextosComuns } from './idioma.ts';
import { ErroApi } from './infra.ts';
import type { EstadoOp } from './tipos.ts';

// ---------------- ícones ----------------

// Traços simples (24 × 24, sem preenchimento), desenhados aqui para não depender de biblioteca nem de arquivo externo.
const ICONES = {
  carrinho: 'M3 4h2.2l2.3 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.6 8H6.4 M9.5 19.5h.01 M17 19.5h.01',
  mais: 'M12 5v14 M5 12h14',
  menos: 'M5 12h14',
  lixo: 'M4 7h16 M9 7V4.5h6V7 M6.5 7l1 12.5h9l1-12.5 M10 11v5 M14 11v5',
  certo: 'M5 12.5l4.5 4.5L19 7.5',
  fechar: 'M6 6l12 12 M18 6L6 18',
  alerta: 'M12 4L2.8 19.5h18.4L12 4z M12 10v4.5 M12 17.2h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5.5 M12 7.8h.01',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2',
  seta: 'M5 12h14 M13 6l6 6-6 6',
  voltar: 'M19 12H5 M11 6l-6 6 6 6',
  externo: 'M14 5h5v5 M19 5l-8 8 M17 14v4.5H5.5V7H10',
  sol: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4',
  lua: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 3v18 M12 7l5 0 M12 12h8.5 M12 17h5',
  baixar: 'M12 4v11 M7 10.5l5 5 5-5 M5 19.5h14',
  imprimir: 'M7 9V4h10v5 M7 17H4.5V9h15v8H17 M7 14h10v6H7z',
  pino: 'M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z M12 15v5.5',
  editar: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  gota: 'M12 3.5s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z',
  termometro: 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z M12 9v7',
  vazao: 'M3 8c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1 M3 14c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1',
  pressao: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 12l4-4 M7.5 15.500h9',
  pausa: 'M8.5 5v14 M15.5 5v14',
  tocar: 'M7 4.500v15l12-7.5-12-7.500z',
  sinal: 'M4.5 9.500a11 11 0 0 1 15 0 M7.5 13a6.5 6.5 0 0 1 9 0 M12 17.200h.01',
  semSinal: 'M4.5 9.500a11 11 0 0 1 4-2.5 M19.5 9.500a11 11 0 0 0-5.5-2.9 M7.5 13a6.5 6.5 0 0 1 3-1.7 M12 17.200h.01 M4 4l16 16',
  lista: 'M8.5 6.500h11 M8.5 12h11 M8.5 17.500h11 M4.5 6.500h.01 M4.5 12h.01 M4.5 17.500h.01',
  documento: 'M7 3.500h7l4 4V20.500H7z M14 3.500v4h4 M9.5 12.500h5 M9.5 16h5',
  caixa: 'M3.5 8L12 3.5 20.5 8v8.500L12 21l-8.5-4.500z M3.5 8L12 12.5 20.5 8 M12 12.500V21',
  repetir: 'M19.5 12a7.5 7.5 0 1 1-2.4-5.5 M19.5 4.500v4h-4',
  raio: 'M13 3L5 13.500h6L10 21l8-10.500h-6z',
} as const;

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg className="icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONES[nome]} />
    </svg>
  );
}

// ---------------- selos ----------------

export type Tom = 'ok' | 'ruim' | 'atencao' | 'info' | 'neutro';

const TOM_ESTADO: Record<EstadoOp, Tom> = {
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

export const tomDoEstado = (estado: EstadoOp): Tom => TOM_ESTADO[estado];

export function Selo({ tom, children, grande }: { tom: Tom; children: ReactNode; grande?: boolean }) {
  return <span className={`selo selo-${tom}${grande ? ' selo-grande' : ''}`}>{children}</span>;
}

export function SeloEstado({ estado, grande }: { estado: EstadoOp; grande?: boolean }) {
  const { t } = useIdioma();
  return <Selo tom={TOM_ESTADO[estado]} grande={grande}>{t.estadoOp[estado]}</Selo>;
}

// ---------------- botões ----------------

type PropsBotao = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'perigo' | 'sutil';
  pequeno?: boolean;
  /** Mostra o giro e desabilita enquanto a ação não termina. */
  ocupado?: boolean;
  icone?: NomeIcone;
  /** Botão só com o ícone: `rotulo` vira o nome acessível e a dica. */
  rotulo?: string;
};

export function Botao({ variante, pequeno, ocupado, icone, rotulo, children, className, disabled, ...resto }: PropsBotao) {
  const classes = ['botao', variante, pequeno && 'pequeno', !children && 'so-icone', className].filter(Boolean).join(' ');
  return (
    <button type="button" {...resto} className={classes} disabled={disabled || ocupado} aria-busy={ocupado || undefined} aria-label={rotulo ?? resto['aria-label']} title={rotulo}>
      {ocupado ? <span className="giro" aria-hidden="true" /> : icone && <Icone nome={icone} tamanho={pequeno ? 15 : 18} />}
      {children}
    </button>
  );
}

// ---------------- campos de formulário ----------------

type PropsCampo = { rotulo: ReactNode; dica?: ReactNode; erro?: string | null };

/** Campo com rótulo, dica e erro junto dele (o erro é anunciado por leitores de tela). */
export function Entrada({ rotulo, dica, erro, className, ...resto }: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`campo${erro ? ' com-erro' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} {...resto} aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : dica ? `${id}-dica` : undefined} />
      {erro ? <small id={`${id}-erro`} className="campo-erro" role="alert"><Icone nome="alerta" tamanho={14} /> {erro}</small>
        : dica ? <small id={`${id}-dica`} className="campo-dica">{dica}</small> : null}
    </div>
  );
}

export function Selecao({ rotulo, dica, erro, className, children, ...resto }: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`campo${erro ? ' com-erro' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} {...resto} aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : dica ? `${id}-dica` : undefined}>
        {children}
      </select>
      {erro ? <small id={`${id}-erro`} className="campo-erro" role="alert"><Icone nome="alerta" tamanho={14} /> {erro}</small>
        : dica ? <small id={`${id}-dica`} className="campo-dica">{dica}</small> : null}
    </div>
  );
}

export function Marcar({ rotulo, ...resto }: { rotulo: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="marcar">
      <input type="checkbox" {...resto} />
      <span>{rotulo}</span>
    </label>
  );
}

/** Número digitado num campo: vazio ou inválido vira NaN (a validação aponta), nunca zero. */
export const numeroDe = (texto: string): number => (texto.trim() === '' ? Number.NaN : Number(texto.replace(',', '.')));

// ---------------- erros ----------------

/** Texto do erro de um campo devolvido pela API (`erros: [{ campo, codigo }]`), já traduzido; null se o campo passou. */
export function erroDoCampo(erro: unknown, campo: string, t: TextosComuns): string | null {
  if (!(erro instanceof ErroApi)) return null;
  const e = erro.dados?.erros?.find((x) => x.campo === campo);
  return e ? (t.erros[e.codigo] ?? e.codigo) : null;
}

/** Texto de um erro que não é de campo (código da API traduzido, ou a falta de resposta). */
export function textoDoErro(erro: unknown, t: TextosComuns): string {
  if (!(erro instanceof ErroApi)) return t.comum.semResposta;
  const codigo = erro.dados?.erro;
  if (codigo && t.erros[codigo]) return t.erros[codigo];
  return codigo ? `${t.comum.erro} (${codigo})` : `${t.comum.erro} (HTTP ${erro.status})`;
}

/**
 * Mostra o erro de uma chamada. Os erros dos campos listados em `campos` já aparecem junto de cada campo: aqui
 * entra só um resumo; os demais são listados com o nome do campo.
 */
export function MensagemErro({ erro, campos = [] }: { erro: unknown; campos?: string[] }) {
  const { t } = useIdioma();
  if (!erro) return null;
  const lista = erro instanceof ErroApi ? (erro.dados?.erros ?? []) : [];
  if (lista.length > 0) {
    const soltos = lista.filter((e) => !campos.includes(e.campo));
    return (
      <div className="aviso aviso-ruim" role="alert">
        <Icone nome="alerta" />
        <div>
          {soltos.length < lista.length && <div>{t.comum.confiraCampos}</div>}
          {soltos.length > 0 && (
            <ul>
              {soltos.map((e, i) => (
                <li key={i}>
                  <strong>{t.campos[e.campo.replace(/^(itens|ordens)\.\d+\./, '')] ?? e.campo}</strong>: {t.erros[e.codigo] ?? e.codigo}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="aviso aviso-ruim" role="alert">
      <Icone nome="alerta" />
      <div>{textoDoErro(erro, t)}</div>
    </div>
  );
}

export function Aviso({ tom, children, icone }: { tom: Tom; children: ReactNode; icone?: NomeIcone }) {
  const padrao: NomeIcone = tom === 'ok' ? 'certo' : tom === 'info' || tom === 'neutro' ? 'info' : 'alerta';
  return (
    <div className={`aviso aviso-${tom}`} role={tom === 'ruim' ? 'alert' : 'status'}>
      <Icone nome={icone ?? padrao} />
      <div>{children}</div>
    </div>
  );
}

// ---------------- avisos passageiros (retorno de cada ação) ----------------

type AvisoPassageiro = { id: number; tom: 'ok' | 'ruim' | 'info'; texto: string };
type ContextoAvisos = { avisar: (tom: AvisoPassageiro['tom'], texto: string) => void };
const AvisosContexto = createContext<ContextoAvisos>({ avisar: () => undefined });

export const useAvisos = () => useContext(AvisosContexto);

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const { t } = useIdioma();
  const [avisos, setAvisos] = useState<AvisoPassageiro[]>([]);
  const proximo = useRef(1);
  const tirar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback<ContextoAvisos['avisar']>(
    (tom, texto) => {
      const id = proximo.current++;
      // um aviso de sucesso novo toma o lugar do anterior (vários cliques seguidos não empilham); os de erro ficam
      setAvisos((a) => [...a.filter((x) => x.tom === 'ruim').slice(-1), { id, tom, texto }]);
      setTimeout(() => tirar(id), tom === 'ruim' ? 8000 : 4000);
    },
    [tirar],
  );
  const valor = useMemo(() => ({ avisar }), [avisar]);
  return (
    <AvisosContexto.Provider value={valor}>
      {children}
      <div className="avisos-passageiros" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso-passageiro aviso-${a.tom}`}>
            <Icone nome={a.tom === 'ok' ? 'certo' : a.tom === 'ruim' ? 'alerta' : 'info'} />
            <span>{a.texto}</span>
            <button type="button" className="fechar-aviso" onClick={() => tirar(a.id)} aria-label={t.comum.fechar}>
              <Icone nome="fechar" tamanho={15} />
            </button>
          </div>
        ))}
      </div>
    </AvisosContexto.Provider>
  );
}

/**
 * Executa as ações de uma tela: marca qual está em andamento (`ocupado` = a chave dada), guarda o erro e mostra o
 * retorno. `fn` devolve o texto de sucesso (vira aviso passageiro) ou nada.
 */
export function useAcao() {
  const { t } = useIdioma();
  const { avisar } = useAvisos();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const executar = useCallback(
    async (chave: string, fn: () => Promise<string | void>, opcoes: { erroNoAviso?: boolean } = {}): Promise<boolean> => {
      setOcupado(chave);
      setErro(null);
      try {
        const texto = await fn();
        if (texto) avisar('ok', texto);
        return true;
      } catch (e) {
        if (opcoes.erroNoAviso) avisar('ruim', textoDoErro(e, t));
        else setErro(e);
        return false;
      } finally {
        setOcupado(null);
      }
    },
    [avisar, t],
  );
  return { ocupado, erro, executar, limparErro: useCallback(() => setErro(null), []) };
}

// ---------------- diálogos ----------------

/** Janela sobre a tela (elemento <dialog>: prende o foco, fecha com Esc). */
export function Dialogo({ aberto, titulo, aoFechar, children, rodape }: { aberto: boolean; titulo: ReactNode; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const { t } = useIdioma();
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      d.showModal();
      // o foco começa no primeiro campo (ou no botão marcado), não no "fechar"
      d.querySelector<HTMLElement>('[data-foco], .dialogo-corpo input, .dialogo-corpo select')?.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar(); // clique fora da caixa
      }}
    >
      {aberto && (
        <div className="dialogo-caixa">
          <header className="dialogo-topo">
            <h2 id={idTitulo}>{titulo}</h2>
            <Botao variante="sutil" icone="fechar" rotulo={t.comum.fechar} onClick={aoFechar} />
          </header>
          <div className="dialogo-corpo">{children}</div>
          {rodape && <footer className="dialogo-rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Confirmacao({ aberto, titulo, texto, confirmar, perigo, ocupado, aoConfirmar, aoFechar }: {
  aberto: boolean; titulo: string; texto: ReactNode; confirmar: string; perigo?: boolean; ocupado?: boolean; aoConfirmar: () => void; aoFechar: () => void;
}) {
  const { t } = useIdioma();
  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar} data-foco>{t.comum.cancelar}</Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} ocupado={ocupado} onClick={aoConfirmar}>{confirmar}</Botao>
        </>
      }
    >
      <p>{texto}</p>
    </Dialogo>
  );
}

// ---------------- estrutura ----------------

/** Título da página, com o texto de apoio e as ações à direita. */
export function Pagina({ titulo, subtitulo, acoes, voltar, children }: { titulo: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; voltar?: { href: string; rotulo: string }; children: ReactNode }) {
  return (
    <>
      {voltar && (
        <a className="voltar" href={voltar.href}>
          <Icone nome="voltar" tamanho={16} /> {voltar.rotulo}
        </a>
      )}
      <header className="pagina-topo">
        <div>
          <h1>{titulo}</h1>
          {subtitulo && <p className="suave">{subtitulo}</p>}
        </div>
        {acoes && <div className="linha">{acoes}</div>}
      </header>
      {children}
    </>
  );
}

export function Cartao({ titulo, children, extra, className }: { titulo?: ReactNode; children: ReactNode; extra?: ReactNode; className?: string }) {
  return (
    <section className={`cartao${className ? ` ${className}` : ''}`}>
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
export function Numero({ rotulo, valor, unidade, texto, tom, apoio, icone }: {
  rotulo: ReactNode; valor: ReactNode; unidade?: string; texto?: boolean; tom?: Tom; apoio?: ReactNode; icone?: NomeIcone;
}) {
  return (
    <div className={`numero${texto ? ' texto' : ''}${tom ? ` numero-${tom}` : ''}`}>
      <div className="numero-rotulo">
        {icone && <Icone nome={icone} tamanho={15} />} {rotulo}
      </div>
      <div className="numero-valor">
        {valor}
        {unidade && <span className="numero-unidade"> {unidade}</span>}
      </div>
      {apoio && <div className="numero-apoio">{apoio}</div>}
    </div>
  );
}

/** Barra de progresso com rótulo (não depende só da cor: o valor aparece escrito por quem chama). */
export function Progresso({ valor, max, rotulo, tom }: { valor: number; max: number; rotulo: string; tom?: 'temperatura' | 'nivel' }) {
  const fracao = max > 0 ? Math.min(1, Math.max(0, valor / max)) : 0;
  return (
    <div className={`progresso${tom ? ` progresso-${tom}` : ''}`} role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={Math.round(max * 10) / 10} aria-valuenow={Math.round(valor * 10) / 10}>
      <span style={{ width: `${fracao * 100}%` }} />
    </div>
  );
}

export function Carregando() {
  const { t } = useIdioma();
  return (
    <div className="carregando" role="status">
      <span className="giro" aria-hidden="true" /> {t.comum.carregando}
    </div>
  );
}

/** Estado vazio: o que falta e, se couber, o que fazer (`children`). */
export function Vazio({ icone = 'caixa', titulo, children }: { icone?: NomeIcone; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="vazio">
      <span className="vazio-icone"><Icone nome={icone} tamanho={26} /></span>
      <p>{titulo}</p>
      {children}
    </div>
  );
}

/** Falha ao buscar os dados de uma tela inteira, com o botão de tentar de novo. */
export function FalhaAoCarregar({ erro, tentar }: { erro: unknown; tentar: () => void }) {
  const { t } = useIdioma();
  return (
    <div className="vazio">
      <span className="vazio-icone ruim"><Icone nome="alerta" tamanho={26} /></span>
      <p role="alert">{textoDoErro(erro, t)}</p>
      <Botao icone="repetir" onClick={tentar}>{t.comum.tentarDeNovo}</Botao>
    </div>
  );
}
