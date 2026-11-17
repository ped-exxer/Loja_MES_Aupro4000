// A bancada ao vivo: o estado que o MES publica a cada ciclo e as leituras dos últimos minutos. Fica guardado fora
// das páginas, para a curva não recomeçar do zero cada vez que se troca de tela, e o topo mostrar a comunicação com
// o CLP em todas elas.

import { useSyncExternalStore } from 'react';
import { api, ouvirEvento } from '@aupro/interface';
import type { Bancada } from '@aupro/interface';

export type Leitura = { horario: number; temperatura: number; nivel: number };
type Vivo = { bancada: Bancada | null; historico: Leitura[] };

const MAXIMO = 720; // 6 minutos a 2 leituras por segundo
let vivo: Vivo = { bancada: null, historico: [] };
const ouvintes = new Set<() => void>();
let iniciado = false;

function receber(bancada: Bancada): void {
  const p = bancada.processo;
  const ultimo = vivo.historico[vivo.historico.length - 1];
  const historico =
    p && bancada.clpVivo && (!ultimo || bancada.atualizadoEm > ultimo.horario)
      ? [...vivo.historico, { horario: bancada.atualizadoEm, temperatura: p.temperatura, nivel: p.nivel }].slice(-MAXIMO)
      : vivo.historico;
  vivo = { bancada, historico };
  for (const o of ouvintes) o();
}

function iniciar(): void {
  if (iniciado) return;
  iniciado = true;
  ouvirEvento<Bancada>('bancada', receber);
  // o primeiro estado sem esperar o próximo ciclo
  api<Bancada>('/api/mes/bancada').then((b) => vivo.bancada ?? receber(b), () => undefined);
}

export function useBancada(): Vivo {
  return useSyncExternalStore(
    (aviso) => {
      iniciar();
      ouvintes.add(aviso);
      return () => ouvintes.delete(aviso);
    },
    () => vivo,
  );
}
