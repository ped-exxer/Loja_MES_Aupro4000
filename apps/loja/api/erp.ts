// ERP da Loja: vitrine, catálogo, clientes, pedidos de venda, faturamento fictício. Base "loja".
// Fala com o MES só por HTTP (cliente-mes.ts): emite e cancela ordens, pergunta prazos, andamento e dossiê. A fatura
// sai do feed de mudanças (mudancas.ts). Se o MES não responde, a rota devolve 503 'mes_fora_do_ar' (main.ts).

import type { FastifyInstance } from 'fastify';
import { FAIXAS, ORIGEM_LOJA, validarReceita, validarTolerancias, type Andamento, type Receita } from '@aupro/dominio';
import { emTransacao, executar, inteiroPositivo, linhas, numero, texto, type Banco, type TempoReal } from '@aupro/servidor';
import { ErroMes, type ClienteMes } from './cliente-mes.ts';
import { CATALOGO_INICIAL } from './esquema.ts';

export { TABELAS_ERP } from './esquema.ts';

const MAX_UNIDADES = 10;

type LinhaProduto = {
  id: number; nome: string; descricao: string | null; preco: number; volume: number; temperatura: number; vazao: number;
  pressao: number; tol_temperatura: number; tol_volume: number; sob_medida: number; ativo: number;
};

type LinhaItem = {
  id: number; pedido_id: number; produto_id: number; nome_produto: string; preco: number; volume: number; temperatura: number;
  vazao: number; pressao: number; tol_temperatura: number; tol_volume: number; prazo: Date | null; numero_op: number | null;
};

const produtoDe = (l: LinhaProduto) => ({
  id: l.id,
  nome: l.nome,
  descricao: l.descricao,
  preco: l.preco,
  receita: { volume: l.volume, temperatura: l.temperatura, vazao: l.vazao, pressao: l.pressao },
  tolerancias: { temperatura: l.tol_temperatura, volume: l.tol_volume },
  sobMedida: l.sob_medida === 1,
  ativo: l.ativo === 1,
});

const itemDe = (l: LinhaItem) => ({
  id: l.id,
  pedidoId: l.pedido_id,
  produtoId: l.produto_id,
  nomeProduto: l.nome_produto,
  preco: l.preco,
  receita: { volume: l.volume, temperatura: l.temperatura, vazao: l.vazao, pressao: l.pressao },
  tolerancias: { temperatura: l.tol_temperatura, volume: l.tol_volume },
  prazo: l.prazo?.getTime() ?? null,
  numeroOp: l.numero_op,
});

export async function semearCatalogo(banco: Banco): Promise<void> {
  const [{ n }] = await linhas<{ n: number }>(banco, 'SELECT COUNT(*) AS n FROM erp_produto');
  if (n > 0) return;
  for (const p of CATALOGO_INICIAL) {
    await executar(
      banco,
      `INSERT INTO erp_produto (nome, descricao, preco, volume, temperatura, vazao, pressao, tol_temperatura, tol_volume, sob_medida)
       VALUES (?, ?, ?, ?, ?, ?, ?, 2, 0.5, ?)`,
      [p.nome, p.descricao, p.preco, p.volume, p.temperatura, p.vazao, p.pressao, p.sobMedida ? 1 : 0],
    );
  }
}

export function criarErp(app: FastifyInstance, banco: Banco, mes: ClienteMes, tempoReal: TempoReal) {
  /** Itens com o andamento perguntado ao MES; com o MES fora do ar, os itens vêm sem andamento (e `mesNoAr` falso). */
  async function itensComAndamento(itens: LinhaItem[]) {
    let andamento: Andamento[] = [];
    let mesNoAr = true;
    try {
      andamento = await mes.andamento(itens.flatMap((i) => (i.numero_op ? [i.numero_op] : [])));
    } catch (erro) {
      if (!(erro instanceof ErroMes) || erro.codigo !== 'mes_fora_do_ar') throw erro;
      mesNoAr = false;
    }
    return { mesNoAr, itens: itens.map((i) => ({ ...itemDe(i), producao: andamento.find((a) => a.numero === i.numero_op) ?? null })) };
  }

  // ---------------- Vitrine ----------------

  app.get('/api/loja/catalogo', async () => {
    const produtos = (await linhas<LinhaProduto>(banco, 'SELECT * FROM erp_produto WHERE ativo = 1 ORDER BY id')).map(produtoDe);
    // o prazo de cada produto sozinho (não somados); sem MES, a vitrine abre sem prazos e avisa
    const prazos = await Promise.all(produtos.map(async (p) => (await mes.estimarPrazos([p.receita]))[0])).catch(() => null);
    return { faixas: FAIXAS, mesNoAr: prazos !== null, produtos: produtos.map((p, i) => ({ ...p, prazoEstimado: prazos?.[i] })) };
  });

  app.post('/api/loja/pedidos', async (req, reply) => {
    const corpo = req.body as {
      cliente?: { nome?: unknown }; // e-mail e turma, se vierem, são ignorados
      itens?: { produtoId?: unknown; quantidade?: unknown; receita?: Partial<Receita> }[];
    };
    const nome = texto(corpo.cliente?.nome, 80);
    const erros: { campo: string; codigo: string }[] = [];
    if (!nome) erros.push({ campo: 'cliente.nome', codigo: 'obrigatorio' });
    if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) erros.push({ campo: 'itens', codigo: 'vazio' });
    if (erros.length > 0) return reply.code(422).send({ erro: 'pedido_invalido', erros });

    // cada unidade é uma batelada
    const unidades: { produto: ReturnType<typeof produtoDe>; receita: Receita }[] = [];
    for (const [i, it] of corpo.itens!.entries()) {
      const id = inteiroPositivo(it.produtoId);
      const quantidade = inteiroPositivo(it.quantidade) ?? 1;
      const [l] = id === null ? [] : await linhas<LinhaProduto>(banco, 'SELECT * FROM erp_produto WHERE id = ? AND ativo = 1', [id]);
      if (!l) {
        erros.push({ campo: `itens.${i}.produtoId`, codigo: 'inexistente' });
        continue;
      }
      const produto = produtoDe(l);
      // sob medida: o cliente escolhe só volume e temperatura; vazão e pressão são sempre as do produto
      // (uma vazão enviada no corpo é ignorada)
      const receita: Receita = produto.sobMedida
        ? {
            volume: numero(it.receita?.volume) ?? Number.NaN,
            temperatura: numero(it.receita?.temperatura) ?? Number.NaN,
            vazao: produto.receita.vazao,
            pressao: produto.receita.pressao,
          }
        : produto.receita;
      for (const e of validarReceita(receita)) erros.push({ campo: `itens.${i}.${e.campo}`, codigo: e.codigo });
      for (let q = 0; q < quantidade; q++) unidades.push({ produto, receita });
    }
    if (unidades.length > MAX_UNIDADES) erros.push({ campo: 'itens', codigo: 'muitas_unidades' });
    if (erros.length > 0) return reply.code(422).send({ erro: 'pedido_invalido', erros });

    // um prazo só para o pedido inteiro (o fim estimado do último item): a ordem do carrinho não deve
    // mexer no sequenciamento do MES. MES fora do ar: o erro sobe como 503 e nada foi gravado.
    const prazoPedido = Math.max(...(await mes.estimarPrazos(unidades.map((u) => u.receita))));
    const prazos = unidades.map(() => prazoPedido);
    // Tudo numa transação: grava o pedido, o MES emite as OPs (todas ou nenhuma) e cada item guarda o número.
    // Se o MES falhar no meio, a transação volta e não fica pedido pela metade.
    const { pedidoId } = await emTransacao(banco, async (c) => {
      // só o nome identifica o cliente; dois alunos podem ter o mesmo nome, então cada pedido tem o seu cliente
      const { insertId: clienteId } = await executar(c, 'INSERT INTO erp_cliente (nome) VALUES (?)', [nome]);
      const pedido = await executar(c, 'INSERT INTO erp_pedido (cliente_id, criado_em) VALUES (?, CURRENT_TIMESTAMP(3))', [clienteId]);
      const itemIds: number[] = [];
      for (const [i, u] of unidades.entries()) {
        const r = await executar(
          c,
          `INSERT INTO erp_item (pedido_id, produto_id, nome_produto, preco, volume, temperatura, vazao, pressao, tol_temperatura, tol_volume, prazo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pedido.insertId, u.produto.id, u.produto.nome, u.produto.preco, u.receita.volume, u.receita.temperatura, u.receita.vazao,
            u.receita.pressao, u.produto.tolerancias.temperatura, u.produto.tolerancias.volume, new Date(prazos[i])],
        );
        itemIds.push(r.insertId);
      }
      // o ERP emite uma ordem de produção por unidade
      const { numeros } = await mes.emitirOrdens(unidades.map((u, i) => ({
        origem: `${ORIGEM_LOJA}${itemIds[i]}`, receita: u.receita, tolerancias: u.produto.tolerancias, prazo: prazos[i], autor: nome,
      })));
      try {
        for (const [i, numeroOp] of numeros.entries()) await executar(c, 'UPDATE erp_item SET numero_op = ? WHERE id = ?', [numeroOp, itemIds[i]]);
      } catch (erro) {
        // o MES já criou as OPs: cancela (estão na fila) antes de desfazer o pedido
        await Promise.allSettled(numeros.map((n) => mes.cancelarOrdem(n)));
        throw erro;
      }
      return { pedidoId: pedido.insertId };
    });
    tempoReal.publicar('pedido', { pedidoId });
    return reply.code(201).send({ pedidoId });
  });

  app.get('/api/loja/pedidos/:id', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    const [p] = id === null ? [] : await linhas<{ id: number; criado_em: Date; nome: string; email: string | null; turma: string | null }>(
      banco,
      'SELECT p.id, p.criado_em, c.nome, c.email, c.turma FROM erp_pedido p JOIN erp_cliente c ON c.id = p.cliente_id WHERE p.id = ?',
      [id],
    );
    if (!p) return reply.code(404).send({ erro: 'pedido_inexistente' });
    const itens = await linhas<LinhaItem>(banco, 'SELECT * FROM erp_item WHERE pedido_id = ? ORDER BY id', [id]);
    return {
      id: p.id,
      criadoEm: p.criado_em.getTime(),
      cliente: { nome: p.nome, email: p.email, turma: p.turma },
      ...(await itensComAndamento(itens)),
    };
  });

  app.get('/api/loja/certificado/:numeroOp', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numeroOp: string }).numeroOp);
    const dossie = n === null ? null : await mes.dossie(n);
    if (!dossie || !dossie.batelada) return reply.code(404).send({ erro: 'sem_certificado' });
    const [item] = await linhas<LinhaItem & { nome: string; email: string | null; turma: string | null }>(
      banco,
      `SELECT i.*, c.nome, c.email, c.turma FROM erp_item i JOIN erp_pedido p ON p.id = i.pedido_id
       JOIN erp_cliente c ON c.id = p.cliente_id WHERE i.numero_op = ?`,
      [n],
    );
    return {
      ...dossie,
      item: item ? itemDe(item) : null,
      cliente: item ? { nome: item.nome, email: item.email, turma: item.turma } : null,
    };
  });

  // ---------------- Pedidos (vendas) ----------------

  app.get('/api/erp/pedidos', async () => {
    const pedidos = await linhas<{ id: number; criado_em: Date; nome: string; email: string | null; turma: string | null }>(
      banco,
      'SELECT p.id, p.criado_em, c.nome, c.email, c.turma FROM erp_pedido p JOIN erp_cliente c ON c.id = p.cliente_id ORDER BY p.id DESC LIMIT 200',
    );
    const itens = pedidos.length === 0 ? [] : await linhas<LinhaItem>(banco, 'SELECT * FROM erp_item WHERE pedido_id IN (?) ORDER BY id', [
      pedidos.map((p) => p.id),
    ]);
    const comAndamento = await itensComAndamento(itens);
    return {
      mesNoAr: comAndamento.mesNoAr,
      pedidos: pedidos.map((p) => ({
        id: p.id,
        criadoEm: p.criado_em.getTime(),
        cliente: { nome: p.nome, email: p.email, turma: p.turma },
        itens: comAndamento.itens.filter((i) => i.pedidoId === p.id),
      })),
    };
  });

  app.post('/api/erp/itens/:id/cancelar', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    const [item] = id === null ? [] : await linhas<LinhaItem>(banco, 'SELECT * FROM erp_item WHERE id = ?', [id]);
    if (!item?.numero_op) return reply.code(404).send({ erro: 'item_inexistente' });
    const r = await mes.cancelarOrdem(item.numero_op); // o 409 do MES ('nao_pode') sobe como 409 (main.ts)
    tempoReal.publicar('pedido', { pedidoId: item.pedido_id });
    return r;
  });

  /** Batelada reprovada, recusada ou abortada: o ERP emite nova OP para o mesmo item. */
  app.post('/api/erp/itens/:id/refazer', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    const [l] = id === null ? [] : await linhas<LinhaItem>(banco, 'SELECT * FROM erp_item WHERE id = ?', [id]);
    if (!l?.numero_op) return reply.code(404).send({ erro: 'item_inexistente' });
    const [andamento] = await mes.andamento([l.numero_op]);
    if (!andamento || !['reprovada', 'recusada', 'abortada'].includes(andamento.estado)) return reply.code(409).send({ erro: 'nao_pode' });
    const item = itemDe(l);
    const [prazo] = await mes.estimarPrazos([item.receita]);
    const { numeros: [numeroOp] } = await mes.emitirOrdens([
      { origem: `${ORIGEM_LOJA}${item.id}`, receita: item.receita, tolerancias: item.tolerancias, prazo, autor: null },
    ]);
    await executar(banco, 'UPDATE erp_item SET numero_op = ?, prazo = ? WHERE id = ?', [numeroOp, new Date(prazo), item.id]);
    tempoReal.publicar('pedido', { pedidoId: item.pedidoId });
    return { numeroOp };
  });

  app.get('/api/erp/faturas', async () => {
    const r = await linhas<{ id: number; numero_op: number; valor: number; emitida_em: Date; nome_produto: string; pedido_id: number; nome: string; email: string | null }>(
      banco,
      `SELECT f.id, f.numero_op, f.valor, f.emitida_em, i.nome_produto, i.pedido_id, c.nome, c.email FROM erp_fatura f
       JOIN erp_item i ON i.id = f.item_id JOIN erp_pedido p ON p.id = i.pedido_id JOIN erp_cliente c ON c.id = p.cliente_id
       ORDER BY f.id DESC`,
    );
    return r.map((f) => ({
      id: f.id, numeroOp: f.numero_op, valor: f.valor, emitidaEm: f.emitida_em.getTime(), produto: f.nome_produto,
      pedidoId: f.pedido_id, cliente: { nome: f.nome, email: f.email },
    }));
  });

  app.get('/api/erp/clientes', async () => linhas(banco, 'SELECT id, nome, email, turma FROM erp_cliente ORDER BY nome'));

  // ---------------- Catálogo (professor) ----------------

  app.get('/api/erp/produtos', async () => (await linhas<LinhaProduto>(banco, 'SELECT * FROM erp_produto ORDER BY id')).map(produtoDe));

  function produtoValido(c: Record<string, unknown>) {
    const receita = { volume: numero(c.volume), temperatura: numero(c.temperatura), vazao: numero(c.vazao), pressao: numero(c.pressao) } as Receita;
    const tolerancias = { temperatura: numero(c.tolTemperatura) ?? Number.NaN, volume: numero(c.tolVolume) ?? Number.NaN };
    const nome = texto(c.nome, 80);
    const preco = numero(c.preco);
    const erros: { campo: string; codigo: string }[] = [
      ...validarReceita(receita).map((e) => ({ campo: e.campo, codigo: e.codigo })),
      ...validarTolerancias(tolerancias).map((e) => ({ campo: e.campo, codigo: e.codigo })),
    ];
    if (!nome) erros.push({ campo: 'nome', codigo: 'obrigatorio' });
    if (preco === null || preco < 0) erros.push({ campo: 'preco', codigo: 'invalido' });
    const valores = [nome, texto(c.descricao), preco, receita.volume, receita.temperatura, receita.vazao, receita.pressao,
      tolerancias.temperatura, tolerancias.volume, c.sobMedida === true ? 1 : 0, c.ativo === false ? 0 : 1];
    return { erros, valores };
  }

  app.post('/api/erp/produtos', async (req, reply) => {
    const { erros, valores } = produtoValido(req.body as Record<string, unknown>);
    if (erros.length > 0) return reply.code(422).send({ erro: 'produto_invalido', erros });
    const r = await executar(
      banco,
      `INSERT INTO erp_produto (nome, descricao, preco, volume, temperatura, vazao, pressao, tol_temperatura, tol_volume, sob_medida, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      valores,
    );
    return reply.code(201).send({ id: r.insertId });
  });

  app.put('/api/erp/produtos/:id', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    const { erros, valores } = produtoValido(req.body as Record<string, unknown>);
    if (id === null) return reply.code(404).send({ erro: 'produto_inexistente' });
    if (erros.length > 0) return reply.code(422).send({ erro: 'produto_invalido', erros });
    const r = await executar(
      banco,
      `UPDATE erp_produto SET nome = ?, descricao = ?, preco = ?, volume = ?, temperatura = ?, vazao = ?, pressao = ?,
         tol_temperatura = ?, tol_volume = ?, sob_medida = ?, ativo = ? WHERE id = ?`,
      [...valores, id],
    );
    return r.affectedRows === 1 ? { ok: true } : reply.code(404).send({ erro: 'produto_inexistente' });
  });

  /**
   * Reiniciar a aula (fica na Loja): primeiro o MES apaga as ordens e registros dele (pelo contrato); só se ele
   * responder a Loja apaga pedidos, clientes e faturas. O catálogo e a configuração da bancada ficam.
   */
  app.post('/api/admin/reiniciar', async () => {
    await mes.reiniciar();
    for (const t of ['erp_fatura', 'erp_item', 'erp_pedido', 'erp_cliente']) await executar(banco, `DELETE FROM ${t}`);
    tempoReal.publicar('reiniciado', {});
    return { ok: true };
  });
}
