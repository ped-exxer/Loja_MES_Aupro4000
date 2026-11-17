// Telas do ERP da Loja: pedidos de venda, faturas, catálogo.

import { useState } from 'react';
import { useIdioma } from '../i18n/index.ts';
import {
  Aviso, Botao, Carregando, Cartao, Confirmacao, Dialogo, Entrada, FalhaAoCarregar, Icone, Marcar, MensagemErro, Numero, Pagina, Selo, SeloEstado, Vazio,
  api, erroDoCampo, fmtDataHora, fmtHora, fmtMoeda, fmtNum, numeroDe, useAcao, useDados, useOutroSistema,
} from '@aupro/interface';
import type { EstadoOp, Fatura, ItemPedido, ListaPedidos, Produto } from '@aupro/interface';

const EM_ANDAMENTO: EstadoOp[] = ['na_fila', 'enviada', 'em_producao', 'produzida', 'comunicacao_perdida'];

export function Vendas() {
  const { t, idioma } = useIdioma();
  const lista = useDados<ListaPedidos>('/api/erp/pedidos', ['pedido', 'producao', 'reiniciado'], 10_000);
  const faturas = useDados<Fatura[]>('/api/erp/faturas', ['pedido', 'producao', 'reiniciado']);
  const mes = useOutroSistema();
  const acao = useAcao();
  const [cancelando, setCancelando] = useState<ItemPedido | null>(null);

  const cancelar = (item: ItemPedido) =>
    acao.executar(`cancelar-${item.id}`, async () => {
      const r = await api<{ resultado?: string }>(`/api/erp/itens/${item.id}/cancelar`, { corpo: {} });
      setCancelando(null);
      await lista.recarregar();
      return r.resultado === 'pendente' ? t.vendas.cancelamentoPendente : t.vendas.cancelado;
    }, { erroNoAviso: true }).then((ok) => ok || setCancelando(null));

  const refazer = (item: ItemPedido) =>
    acao.executar(`refazer-${item.id}`, async () => {
      const r = await api<{ numeroOp: number }>(`/api/erp/itens/${item.id}/refazer`, { corpo: {} });
      await lista.recarregar();
      return `${t.vendas.refeito} ${r.numeroOp}.`;
    }, { erroNoAviso: true });

  const pedidos = lista.dados?.pedidos ?? null;
  const total = (faturas.dados ?? []).reduce((s, f) => s + f.valor, 0);
  const emAndamento = (pedidos ?? []).flatMap((p) => p.itens).filter((i) => i.producao && EM_ANDAMENTO.includes(i.producao.estado)).length;

  return (
    <Pagina titulo={t.vendas.titulo} subtitulo={t.vendas.subtitulo}>
      <div className="numeros">
        <Numero icone="lista" rotulo={t.vendas.pedidos} valor={pedidos ? String(pedidos.length) : '—'} />
        <Numero icone="relogio" rotulo={t.vendas.emAndamento} valor={pedidos && lista.dados?.mesNoAr ? String(emAndamento) : '—'} />
        <Numero icone="documento" rotulo={t.vendas.faturado} valor={faturas.dados ? fmtMoeda(total, idioma) : '—'} />
      </div>
      {lista.dados && !lista.dados.mesNoAr && <Aviso tom="atencao">{t.vendas.mesForaDoAr}</Aviso>}

      {!pedidos ? (
        <Cartao>{lista.erro ? <FalhaAoCarregar erro={lista.erro} tentar={lista.recarregar} /> : <Carregando />}</Cartao>
      ) : pedidos.length === 0 ? (
        <Cartao>
          <Vazio icone="lista" titulo={t.vendas.semPedidos}>
            <a className="botao primario" href="#/">{t.menu.loja}</a>
          </Vazio>
        </Cartao>
      ) : (
        pedidos.map((p) => (
          <Cartao key={p.id}>
            <div className="pedido-topo">
              <h2>
                <a href={`#/pedido/${p.id}`}>{t.comum.pedido} {p.id}</a>
              </h2>
              <span>{p.cliente.nome}</span>
              <span className="suave pequeno">{fmtDataHora(p.criadoEm, idioma)}</span>
              <span className="espaco" />
              <strong className="num">{fmtMoeda(p.itens.reduce((s, i) => s + i.preco, 0), idioma)}</strong>
              <a className="botao pequeno" href={`#/pedido/${p.id}`}>
                {t.vendas.acompanhar} <Icone nome="seta" tamanho={14} />
              </a>
            </div>
            <ul className="pedido-itens">
              {p.itens.map((i) => {
                const estado = i.producao?.estado;
                return (
                  <li key={i.id}>
                    <div>
                      <div className="nome">{i.nomeProduto}</div>
                      <div className="suave pequeno">
                        {fmtNum(i.receita.volume, idioma)} {t.unidades.litros} · {fmtNum(i.receita.temperatura, idioma, 0)} {t.unidades.celsius}
                        {i.numeroOp && (
                          <>
                            {' · '}
                            {mes ? <a href={`${mes}/#/op/${i.numeroOp}`}>{t.comum.op} {i.numeroOp}</a> : `${t.comum.op} ${i.numeroOp}`}
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      {estado ? <SeloEstado estado={estado} /> : <Selo tom="neutro">{t.vendas.semAndamento}</Selo>}
                      {i.producao?.recusa ? <div className="suave pequeno">{t.comum.motivo}: {t.recusa[i.producao.recusa] ?? i.producao.recusa}</div> : null}
                      {estado && EM_ANDAMENTO.includes(estado) && i.prazo && (
                        <div className="suave pequeno">{t.comum.prazo} {fmtHora(i.prazo, idioma, false)}</div>
                      )}
                    </div>
                    <div className="preco-item">{fmtMoeda(i.preco, idioma)}</div>
                    <div className="acao">
                      {(estado === 'na_fila' || estado === 'enviada') && (
                        <Botao pequeno variante="perigo" ocupado={acao.ocupado === `cancelar-${i.id}`} onClick={() => setCancelando(i)}>
                          {t.vendas.cancelarItem}
                        </Botao>
                      )}
                      {(estado === 'reprovada' || estado === 'recusada' || estado === 'abortada') && (
                        <Botao pequeno icone="repetir" ocupado={acao.ocupado === `refazer-${i.id}`} onClick={() => refazer(i)}>
                          {t.vendas.refazer}
                        </Botao>
                      )}
                      {estado === 'aprovada' && (
                        <a className="botao pequeno" href={`#/certificado/${i.numeroOp}`}>
                          <Icone nome="documento" tamanho={15} /> {t.acompanhamento.certificado}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        ))
      )}

      <Cartao titulo={t.vendas.faturas} extra={faturas.dados && faturas.dados.length > 0 ? <strong className="num">{fmtMoeda(total, idioma)}</strong> : undefined}>
        {!faturas.dados ? (
          faturas.erro ? <FalhaAoCarregar erro={faturas.erro} tentar={faturas.recarregar} /> : <Carregando />
        ) : faturas.dados.length === 0 ? (
          <Vazio icone="documento" titulo={t.vendas.semFaturas} />
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>{t.vendas.fatura}</th>
                  <th>{t.vendas.emitida}</th>
                  <th>{t.comum.cliente}</th>
                  <th>{t.comum.produto}</th>
                  <th>{t.comum.pedido}</th>
                  <th>{t.comum.op}</th>
                  <th className="num">{t.comum.total}</th>
                </tr>
              </thead>
              <tbody>
                {faturas.dados.map((f) => (
                  <tr key={f.id}>
                    <td className="num" style={{ textAlign: 'left' }}>#{f.id}</td>
                    <td>{fmtDataHora(f.emitidaEm, idioma)}</td>
                    <td>{f.cliente.nome}</td>
                    <td>{f.produto}</td>
                    <td><a href={`#/pedido/${f.pedidoId}`}>{f.pedidoId}</a></td>
                    <td><a href={`#/certificado/${f.numeroOp}`}>{f.numeroOp}</a></td>
                    <td className="num">{fmtMoeda(f.valor, idioma)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>{t.comum.total}</td>
                  <td className="num">{fmtMoeda(total, idioma)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Cartao>

      <Confirmacao
        aberto={cancelando !== null}
        titulo={t.vendas.cancelarTitulo}
        texto={
          <>
            <strong>{cancelando?.nomeProduto}</strong> ({t.comum.op} {cancelando?.numeroOp}). {t.vendas.cancelarTexto}
          </>
        }
        confirmar={t.vendas.cancelarItem}
        perigo
        ocupado={cancelando !== null && acao.ocupado === `cancelar-${cancelando.id}`}
        aoConfirmar={() => cancelando && cancelar(cancelando)}
        aoFechar={() => setCancelando(null)}
      />
    </Pagina>
  );
}

// ---------------- catálogo ----------------

/** Os campos do formulário ficam como texto (o que a pessoa digitou); viram número só ao salvar. */
type FormProduto = {
  nome: string; descricao: string; preco: string; volume: string; temperatura: string; vazao: string; pressao: string;
  tolTemperatura: string; tolVolume: string; sobMedida: boolean; ativo: boolean;
};

const formDe = (p: Produto): FormProduto => ({
  nome: p.nome,
  descricao: p.descricao ?? '',
  preco: String(p.preco),
  volume: String(p.receita.volume),
  temperatura: String(p.receita.temperatura),
  vazao: String(p.receita.vazao),
  pressao: String(p.receita.pressao),
  tolTemperatura: String(p.tolerancias.temperatura),
  tolVolume: String(p.tolerancias.volume),
  sobMedida: p.sobMedida,
  ativo: p.ativo,
});

const NOVO: FormProduto = {
  nome: '', descricao: '', preco: '10', volume: '10', temperatura: '45', vazao: '4', pressao: '2', tolTemperatura: '2', tolVolume: '0.5', sobMedida: false, ativo: true,
};

// campo do formulário → campo do erro que a API devolve
const CAMPO_API = {
  nome: 'nome', preco: 'preco', volume: 'volume', temperatura: 'temperatura', vazao: 'vazao', pressao: 'pressao',
  tolTemperatura: 'tolerancia.temperatura', tolVolume: 'tolerancia.volume',
} as const;

export function Catalogo() {
  const { t, idioma } = useIdioma();
  const { dados, erro, recarregar } = useDados<Produto[]>('/api/erp/produtos', ['reiniciado']);
  const [editando, setEditando] = useState<{ id: number | null; form: FormProduto } | null>(null);
  const acao = useAcao();

  const abrir = (e: { id: number | null; form: FormProduto }) => {
    acao.limparErro();
    setEditando(e);
  };

  async function salvar() {
    if (!editando) return;
    const f = editando.form;
    const corpo = {
      nome: f.nome, descricao: f.descricao, sobMedida: f.sobMedida, ativo: f.ativo,
      preco: numeroDe(f.preco), volume: numeroDe(f.volume), temperatura: numeroDe(f.temperatura), vazao: numeroDe(f.vazao),
      pressao: numeroDe(f.pressao), tolTemperatura: numeroDe(f.tolTemperatura), tolVolume: numeroDe(f.tolVolume),
    };
    await acao.executar('salvar', async () => {
      if (editando.id === null) await api('/api/erp/produtos', { corpo });
      else await api(`/api/erp/produtos/${editando.id}`, { metodo: 'PUT', corpo });
      setEditando(null);
      await recarregar();
      return t.catalogo.salvo;
    });
  }

  const campo = (chave: keyof typeof CAMPO_API, rotulo: string, numero = true, classe?: string) =>
    editando && (
      <Entrada
        className={classe}
        rotulo={rotulo}
        type={numero ? 'number' : 'text'}
        inputMode={numero ? 'decimal' : undefined}
        step={numero ? 'any' : undefined}
        value={editando.form[chave]}
        onChange={(e) => setEditando({ ...editando, form: { ...editando.form, [chave]: e.target.value } })}
        erro={erroDoCampo(acao.erro, CAMPO_API[chave], t)}
      />
    );

  return (
    <Cartao
      titulo={t.catalogo.titulo}
      extra={
        <Botao variante="primario" icone="mais" onClick={() => abrir({ id: null, form: NOVO })}>
          {t.catalogo.novo}
        </Botao>
      }
    >
      <p className="suave">{t.catalogo.texto}</p>
      {!dados ? (
        erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />
      ) : dados.length === 0 ? (
        <Vazio titulo={t.catalogo.vazio} />
      ) : (
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>{t.comum.produto}</th>
                <th className="num">{t.comum.volume}</th>
                <th className="num">{t.comum.temperatura}</th>
                <th className="num">{t.comum.vazao}</th>
                <th className="num">{t.comum.pressao}</th>
                <th className="num">{t.comum.preco}</th>
                <th>{t.comum.estado}</th>
                <th><span className="so-leitor">{t.comum.acoes}</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nome}</strong> {p.sobMedida && <Selo tom="info">{t.catalogo.sobMedidaCurto}</Selo>}
                    {p.descricao && <div className="suave pequeno">{p.descricao}</div>}
                  </td>
                  <td className="num">{fmtNum(p.receita.volume, idioma)} {t.unidades.litros} <span className="suave">±{fmtNum(p.tolerancias.volume, idioma)}</span></td>
                  <td className="num">{fmtNum(p.receita.temperatura, idioma, 0)} {t.unidades.celsius} <span className="suave">±{fmtNum(p.tolerancias.temperatura, idioma)}</span></td>
                  <td className="num">{fmtNum(p.receita.vazao, idioma)} {t.unidades.lmin}</td>
                  <td className="num">{fmtNum(p.receita.pressao, idioma)} {t.unidades.bar}</td>
                  <td className="num">{fmtMoeda(p.preco, idioma)}</td>
                  <td>{p.ativo ? <Selo tom="ok">{t.catalogo.ativo}</Selo> : <Selo tom="neutro">{t.catalogo.foraDeVenda}</Selo>}</td>
                  <td className="acoes">
                    <Botao pequeno icone="editar" onClick={() => abrir({ id: p.id, form: formDe(p) })} aria-label={`${t.catalogo.editar}: ${p.nome}`}>
                      {t.catalogo.editar}
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo
        aberto={editando !== null}
        titulo={editando?.id === null ? t.catalogo.novo : t.catalogo.editarTitulo}
        aoFechar={() => setEditando(null)}
        rodape={
          <>
            <Botao onClick={() => setEditando(null)}>{t.comum.cancelar}</Botao>
            <Botao variante="primario" ocupado={acao.ocupado === 'salvar'} type="submit" form="form-produto">{t.comum.salvar}</Botao>
          </>
        }
      >
        {editando && (
          <form
            id="form-produto"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <div className="campos">
              {campo('nome', t.catalogo.nome, false, 'inteiro')}
              <Entrada
                className="inteiro"
                rotulo={t.catalogo.descricao}
                value={editando.form.descricao}
                onChange={(e) => setEditando({ ...editando, form: { ...editando.form, descricao: e.target.value } })}
              />
              {campo('preco', `${t.comum.preco} (R$)`)}
            </div>
            <h3>{t.catalogo.receita}</h3>
            <div className="campos">
              {campo('volume', `${t.comum.volume} (${t.unidades.litros})`)}
              {campo('temperatura', `${t.comum.temperatura} (${t.unidades.celsius})`)}
              {campo('vazao', `${t.comum.vazao} (${t.unidades.lmin})`)}
              {campo('pressao', `${t.comum.pressao} (${t.unidades.bar})`)}
              {campo('tolTemperatura', `${t.campos['tolerancia.temperatura']} (±${t.unidades.celsius})`)}
              {campo('tolVolume', `${t.campos['tolerancia.volume']} (±${t.unidades.litros})`)}
            </div>
            <Marcar rotulo={t.catalogo.sobMedida} checked={editando.form.sobMedida} onChange={(e) => setEditando({ ...editando, form: { ...editando.form, sobMedida: e.target.checked } })} />
            <Marcar rotulo={t.catalogo.ativo} checked={editando.form.ativo} onChange={(e) => setEditando({ ...editando, form: { ...editando.form, ativo: e.target.checked } })} />
            <MensagemErro erro={acao.erro} campos={Object.values(CAMPO_API)} />
          </form>
        )}
      </Dialogo>
    </Cartao>
  );
}
