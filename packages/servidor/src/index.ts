// Infraestrutura comum dos dois sistemas (Loja e MES): banco, utilidades das rotas, tempo real, tela estática.
// Só infraestrutura: nenhuma regra de negócio aqui (essas ficam em packages/dominio).

export * from './banco.ts';
export * from './http.ts';
export * from './tempo-real.ts';
export * from './tela.ts';
export * from './sistema.ts';
