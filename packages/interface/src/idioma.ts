// Idioma das telas. Cada sistema junta os textos comuns (./i18n) com os dele e passa ao `ProvedorIdioma`;
// os componentes comuns só usam a parte comum (`TextosComuns`).

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pt } from './i18n/pt.ts';

export type Idioma = 'pt' | 'en' | 'es';
export type TextosComuns = typeof pt;

export const LOCALE: Record<Idioma, string> = { pt: 'pt-BR', en: 'en', es: 'es' };

export function idiomaInicial(): Idioma {
  try {
    const salvo = localStorage.getItem('idioma');
    if (salvo === 'pt' || salvo === 'en' || salvo === 'es') return salvo;
  } catch {
    // sem armazenamento: segue pelo navegador
  }
  const navegador = navigator.language.slice(0, 2);
  return navegador === 'en' || navegador === 'es' ? navegador : 'pt';
}

export type ContextoIdioma<T extends TextosComuns = TextosComuns> = { idioma: Idioma; t: T; trocar: (i: Idioma) => void };

const IdiomaContexto = createContext<ContextoIdioma>({ idioma: 'pt', t: pt, trocar: () => undefined });

/** Os textos de cada sistema estendem os comuns; quem chama escolhe o tipo dos seus (ex.: `useIdioma<TextosLoja>()`). */
export const useIdioma = <T extends TextosComuns = TextosComuns>() => useContext(IdiomaContexto) as ContextoIdioma<T>;

export function ProvedorIdioma<T extends TextosComuns>({ textos, children }: { textos: Record<Idioma, T>; children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial);
  const valor = useMemo(
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
    [idioma, textos],
  );
  useEffect(() => {
    document.documentElement.lang = idioma === 'pt' ? 'pt-BR' : idioma;
  }, [idioma]);
  return createElement(IdiomaContexto.Provider, { value: valor }, children);
}
