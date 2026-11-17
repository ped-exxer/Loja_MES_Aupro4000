// A Loja: uma interface só (vitrine + retaguarda), rotas por hash.

import { useEffect, useMemo, useState } from 'react';
import { IdiomaContexto, idiomaInicial, textos, type Idioma } from './i18n/index.ts';
import { Acompanhamento, Certificado, MeusPedidos, Vitrine } from './paginas/loja.tsx';
import { Retaguarda } from './paginas/retaguarda.tsx';

function rotaAtual(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function App() {
  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial);
  const [rota, setRota] = useState<string[]>(rotaAtual);

  useEffect(() => {
    const aoMudar = () => setRota(rotaAtual());
    addEventListener('hashchange', aoMudar);
    return () => removeEventListener('hashchange', aoMudar);
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma === 'pt' ? 'pt-BR' : idioma;
  }, [idioma]);

  const contexto = useMemo(
    () => ({
      idioma,
      t: textos[idioma],
      trocar: (i: Idioma) => {
        setIdioma(i);
        try {
          localStorage.setItem('idioma', i);
        } catch {
          // sem armazenamento
        }
      },
    }),
    [idioma],
  );
  const t = contexto.t;
  const navegar = (r: string) => {
    location.hash = r;
  };

  const [secao, ...resto] = rota;
  const pagina =
    secao === 'pedido' && resto[0] ? <Acompanhamento id={Number(resto[0])} />
    : secao === 'pedidos' ? <MeusPedidos />
    : secao === 'certificado' && resto[0] ? <Certificado numero={Number(resto[0])} />
    : secao === 'retaguarda' ? <Retaguarda caminho={resto} />
    : <Vitrine navegar={navegar} />;

  const ativo = (s: string | undefined) => (secao === s || (s === undefined && !['pedidos', 'pedido', 'retaguarda', 'certificado'].includes(secao ?? '')) ? 'ativo' : '');

  return (
    <IdiomaContexto.Provider value={contexto}>
      <header className="topo">
        <a className="marca" href="#/">
          {t.titulo}
        </a>
        <nav>
          <a href="#/" className={ativo(undefined)}>{t.menu.loja}</a>
          <a href="#/pedidos" className={ativo('pedidos')}>{t.menu.meusPedidos}</a>
          <a href="#/retaguarda" className={ativo('retaguarda')}>{t.menu.retaguarda}</a>
        </nav>
        <label className="idioma marcar">
          <span className="suave pequeno">{t.idioma}</span>
          <select value={idioma} onChange={(e) => contexto.trocar(e.target.value as Idioma)}>
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>
      </header>
      <main>{pagina}</main>
    </IdiomaContexto.Provider>
  );
}
