import { createContext, useContext } from 'react';
import { pt } from './pt.ts';
import { en } from './en.ts';
import { es } from './es.ts';

export type Idioma = 'pt' | 'en' | 'es';
export type Textos = typeof pt;

export const textos: Record<Idioma, Textos> = { pt, en, es };
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

export type ContextoIdioma = { idioma: Idioma; t: Textos; trocar: (i: Idioma) => void };

export const IdiomaContexto = createContext<ContextoIdioma>({ idioma: 'pt', t: pt, trocar: () => undefined });

export const useIdioma = () => useContext(IdiomaContexto);
