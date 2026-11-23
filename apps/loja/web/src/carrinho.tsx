// O carrinho da Loja: fica no App (o contador do topo e a vitrine usam o mesmo) e guardado enquanto a aba estiver
// aberta: passear pelos Pedidos e voltar não o esvazia.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** O máximo de unidades num pedido inteiro (o mesmo da API: `MAX_UNIDADES` em apps/loja/api/erp.ts). */
export const MAX_UNIDADES = 10;

/** O que o cliente escolheu: no sob medida, o volume e a temperatura dele; nos outros, os do produto. */
export type LinhaSalva = { produtoId: number; volume: number; temperatura: number; quantidade: number };

const CHAVE_CARRINHO = 'carrinho';

function carrinhoSalvo(): LinhaSalva[] {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_CARRINHO) ?? '[]') as LinhaSalva[];
    return Array.isArray(salvo) ? salvo.filter((l) => Number.isInteger(l?.produtoId) && Number.isInteger(l?.quantidade) && l.quantidade > 0) : [];
  } catch {
    return [];
  }
}

const igual = (a: LinhaSalva, b: Omit<LinhaSalva, 'quantidade'>) => a.produtoId === b.produtoId && a.volume === b.volume && a.temperatura === b.temperatura;

function useCarrinhoGuardado() {
  const [linhas, setLinhas] = useState<LinhaSalva[]>(carrinhoSalvo);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_CARRINHO, JSON.stringify(linhas));
    } catch {
      // sem armazenamento: o carrinho vale só nesta tela
    }
  }, [linhas]);
  return useMemo(
    () => ({
      linhas,
      /** Unidades no carrinho (o topo mostra este número). */
      unidades: linhas.reduce((s, l) => s + l.quantidade, 0),
      /** Junta com a linha igual (mesmo produto, volume e temperatura), se houver. */
      adicionar: (nova: LinhaSalva) =>
        setLinhas((c) => (c.some((l) => igual(l, nova)) ? c.map((l) => (igual(l, nova) ? { ...l, quantidade: l.quantidade + nova.quantidade } : l)) : [...c, nova])),
      /** Muda a quantidade da linha `i`; zero tira a linha. */
      mudar: (i: number, quantidade: number) => setLinhas((c) => c.flatMap((l, j) => (j !== i ? [l] : quantidade > 0 ? [{ ...l, quantidade }] : []))),
      esvaziar: () => setLinhas([]),
    }),
    [linhas],
  );
}

type Carrinho = ReturnType<typeof useCarrinhoGuardado>;
const CarrinhoContexto = createContext<Carrinho | null>(null);

export function ProvedorCarrinho({ children }: { children: ReactNode }) {
  return <CarrinhoContexto.Provider value={useCarrinhoGuardado()}>{children}</CarrinhoContexto.Provider>;
}

export function useCarrinho(): Carrinho {
  const c = useContext(CarrinhoContexto);
  if (!c) throw new Error('useCarrinho fora do ProvedorCarrinho');
  return c;
}
