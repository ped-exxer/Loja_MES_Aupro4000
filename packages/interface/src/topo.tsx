// Topo das duas telas: "AUPRO4000 · Loja" ou "AUPRO4000 · MES" bem visível, o menu do sistema, o link para o
// outro sistema e o idioma. Rotas por hash (#/fila).

import { useEffect, useState } from 'react';
import { useIdioma, type Idioma } from './idioma.ts';
import { useDados } from './infra.ts';

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

export function Topo({ sistema, menu, marcada }: { sistema: NomeSistema; menu: { rota: string; rotulo: string }[]; marcada: string }) {
  const { t, idioma, trocar } = useIdioma();
  const outro = useOutroSistema();
  useEffect(() => {
    document.title = `${t.titulo} · ${t.sistema[sistema]}`;
  }, [t, sistema]);

  return (
    <header className="topo" data-sistema={sistema}>
      <a className="marca" href="#/">
        {t.titulo} <span className="marca-sistema">· {t.sistema[sistema]}</span>
      </a>
      <nav>
        {menu.map((m) => (
          <a key={m.rota} href={`#/${m.rota}`} className={marcada === m.rota ? 'ativo' : ''}>
            {m.rotulo}
          </a>
        ))}
      </nav>
      <span className="espaco" />
      {outro && (
        <a className="outro-sistema" href={`${outro}/`}>
          {sistema === 'loja' ? t.sistema.abrirMes : t.sistema.abrirLoja} →
        </a>
      )}
      <label className="idioma marcar">
        <span className="suave pequeno">{t.idioma}</span>
        <select value={idioma} onChange={(e) => trocar(e.target.value as Idioma)}>
          <option value="pt">Português</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
    </header>
  );
}
