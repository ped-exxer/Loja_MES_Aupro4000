// Módulo MES. Para o ERP, só a interface abaixo: emitir e cancelar ordens, prazos, andamento e dossiê.

import type { Mes } from './nucleo.ts';

export { Mes, type ContextoMes, type MudancaOrdem } from './nucleo.ts';
export { TABELAS_MES } from './esquema.ts';
export { registrarRotasMes } from './rotas.ts';

export type InterfaceMes = Pick<Mes, 'emitirOrdem' | 'cancelarOrdem' | 'estimarPrazos' | 'andamento' | 'dossie' | 'aoMudar'>;
