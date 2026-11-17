// Textos da tela da Loja: os comuns (packages/interface) mais os específicos, em pt, en e es (mesmas chaves).
import { useIdioma as useIdiomaComum, type Idioma } from '@aupro/interface';
import { pt } from './pt.ts';
import { en } from './en.ts';
import { es } from './es.ts';

export type Textos = typeof pt;
export const textos: Record<Idioma, Textos> = { pt, en, es };
export const useIdioma = () => useIdiomaComum<Textos>();
