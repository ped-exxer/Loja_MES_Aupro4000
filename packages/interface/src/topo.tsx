// Topo das duas telas: "AUPRO4000 · Loja" ou "AUPRO4000 · MES" bem visível (cada sistema com a sua cor), o menu do
// sistema, o link para o outro sistema, o idioma e o tema. Rotas por hash (#/fila).

import { useEffect, useState, type ReactNode } from 'react';
import { Icone } from './componentes.tsx';
import { useIdioma, type Idioma } from './idioma.ts';
import { useConexao, useDados } from './infra.ts';
import { TEMAS, useTema } from './tema.ts';

export type NomeSistema = 'loja' | 'mes';
type Sistema = { sistema: NomeSistema; outro: { sistema: NomeSistema; url: string | null; porta: number } };

function rotaAtual(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

/** A rota atual (partes depois de "#/"). */
export function useRota(): string[] {
  const [rota, setRota] = useState<string[]>(rotaAtual);
  useEffect(() => {
    const aoMudar = () => setRota(rotaAtual());
    addEventListener('hashchange', aoMudar);
    return () => removeEventListener('hashchange', aoMudar);
  }, []);
  return rota;
}

/** Endereço do outro sistema (sem barra no fim): o configurado, ou este mesmo host na porta do outro. */
export function useOutroSistema(): string | null {
  const { dados } = useDados<Sistema>('/api/sistema');
  if (!dados) return null;
  return dados.outro.url ?? `${location.protocol}//${location.hostname}:${dados.outro.porta}`;
}

const ICONE_TEMA = { auto: 'auto', claro: 'sol', escuro: 'lua' } as const;

/** Marca do produto: o tanque com a água. */
function Logo() {
  return (
    <svg className="marca-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.18" />
      <path d="M9 8.5h14M10.5 8.5v13a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3v-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.5 16c2-1.4 3.6-1.4 5.5 0s3.5 1.4 5.5 0v5.5a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3z" fill="currentColor" />
    </svg>
  );
}

export function Topo({ sistema, menu, marcada, extra }: {
  sistema: NomeSistema;
  menu: { rota: string; rotulo: string }[];
  marcada: string;
  /** Indicador próprio do sistema (no MES, o estado da comunicação com o CLP). */
  extra?: ReactNode;
}) {
  const { t, idioma, trocar } = useIdioma();
  const { tema, trocar: trocarTema } = useTema();
  const outro = useOutroSistema();
  const noAr = useConexao();
  useEffect(() => {
    document.title = `${t.titulo} · ${t.sistema[sistema]}`;
    document.documentElement.dataset.sistema = sistema;
  }, [t, sistema]);
  const proximoTema = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];

  return (
    <>
      <a className="pular" href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>
        {t.topo.pular}
      </a>
      <header className="topo">
        <div className="topo-dentro">
          <a className="marca" href="#/" aria-label={`${t.titulo} ${t.sistema[sistema]}`}>
            <Logo />
            <span className="marca-nome">{t.titulo}</span>
            <span className="marca-sistema">{t.sistema[sistema]}</span>
          </a>
          <nav className="menu" aria-label={t.topo.menu}>
            {menu.map((m) => (
              <a key={m.rota} href={`#/${m.rota}`} className={marcada === m.rota ? 'ativo' : ''} aria-current={marcada === m.rota ? 'page' : undefined}>
                {m.rotulo}
              </a>
            ))}
          </nav>
          <div className="topo-extras">
            {extra}
            {outro && (
              <a className="topo-botao outro-sistema" href={`${outro}/`}>
                <span>{sistema === 'loja' ? t.sistema.abrirMes : t.sistema.abrirLoja}</span>
                <Icone nome="externo" tamanho={16} />
              </a>
            )}
            <select className="topo-botao idioma" value={idioma} onChange={(e) => trocar(e.target.value as Idioma)} aria-label={t.idioma}>
              <option value="pt">PT</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
            <button
              type="button"
              className="topo-botao so-icone"
              onClick={() => trocarTema(proximoTema)}
              aria-label={`${t.tema.rotulo}: ${t.tema[tema]}`}
              title={`${t.tema.rotulo}: ${t.tema[tema]}`}
            >
              <Icone nome={ICONE_TEMA[tema]} />
            </button>
          </div>
        </div>
      </header>
      {!noAr && (
        <div className="faixa-sem-servidor" role="status">
          <Icone nome="semSinal" tamanho={16} /> {t.topo.semServidor}
        </div>
      )}
    </>
  );
}
