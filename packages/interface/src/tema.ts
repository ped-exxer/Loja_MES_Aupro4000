// Tema das telas: automático (segue o sistema operacional), claro ou escuro. A escolha fica no navegador e vale
// como `data-tema` no <html>; o estilo.css define as cores de cada um.

import { useCallback, useState } from 'react';

export type Tema = 'auto' | 'claro' | 'escuro';
export const TEMAS: readonly Tema[] = ['auto', 'claro', 'escuro'];

function temaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem('tema');
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch {
    // sem armazenamento: segue o sistema
  }
  return 'auto';
}

function aplicar(tema: Tema): void {
  if (tema === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

// vale antes de a tela aparecer, para não piscar no tema errado
aplicar(temaSalvo());

export function useTema(): { tema: Tema; trocar: (t: Tema) => void } {
  const [tema, setTema] = useState<Tema>(temaSalvo);
  const trocar = useCallback((novo: Tema) => {
    setTema(novo);
    aplicar(novo);
    try {
      if (novo === 'auto') localStorage.removeItem('tema');
      else localStorage.setItem('tema', novo);
    } catch {
      // sem armazenamento
    }
  }, []);
  return { tema, trocar };
}
