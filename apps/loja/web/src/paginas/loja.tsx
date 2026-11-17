// Vitrine: catálogo, carrinho, pedido, acompanhamento ao vivo, certificado.

import { useState } from 'react';
import { validarReceita, type Receita } from '@aupro/dominio';
import { useIdioma } from '../i18n/index.ts';
import {
  COR_NIVEL, COR_TEMPERATURA, Carregando, Cartao, Grafico, MensagemErro, Numero, Selo, SeloEstado,
  api, fmtDataHora, fmtDuracao, fmtHora, fmtMoeda, fmtNum, useDados,
} from '@aupro/interface';
import type { Catalogo, Certificado as TipoCertificado, ItemPedido, Pedido, Produto } from '@aupro/interface';

type LinhaCarrinho = { produto: Produto; receita: Receita; quantidade: number };

export function Vitrine({ navegar }: { navegar: (rota: string) => void }) {
  const { t, idioma } = useIdioma();
  const { dados, erro } = useDados<Catalogo>('/api/loja/catalogo', ['producao', 'reiniciado'], 15_000);
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);
  const [cliente, setCliente] = useState({ nome: '' });
  const [enviando, setEnviando] = useState(false);
  const [erroPedido, setErroPedido] = useState<unknown>(null);

  async function confirmar() {
    setEnviando(true);
    setErroPedido(null);
    try {
      const r = await api<{ pedidoId: number }>('/api/loja/pedidos', {
        corpo: {
          cliente,
          itens: carrinho.map((l) => ({
            produtoId: l.produto.id,
            quantidade: l.quantidade,
            // sob medida: só volume e temperatura; vazão e pressão vêm do produto
            receita: l.produto.sobMedida ? { volume: l.receita.volume, temperatura: l.receita.temperatura } : undefined,
          })),
        },
      });
      setCarrinho([]);
      navegar(`/pedido/${r.pedidoId}`);
    } catch (e) {
      setErroPedido(e);
    } finally {
      setEnviando(false);
    }
  }

  if (erro) return <MensagemErro erro={erro} />;
  if (!dados) return <Carregando />;
  const total = carrinho.reduce((s, l) => s + l.produto.preco * l.quantidade, 0);

  return (
    <>
      <h1>{t.vitrine.titulo}</h1>
      <p className="suave">{t.vitrine.subtitulo}</p>
      {!dados.mesNoAr && <div className="aviso aviso-atencao">{t.vitrine.mesForaDoAr}</div>}
      <div className="colunas">
        <div className="grade">
          {dados.produtos.map((p) => (
            <CartaoProduto
              key={p.id}
              produto={p}
              faixas={dados.faixas}
              adicionar={(receita) =>
                setCarrinho((c) => {
                  const igual = c.find((l) => l.produto.id === p.id && JSON.stringify(l.receita) === JSON.stringify(receita));
                  return igual
                    ? c.map((l) => (l === igual ? { ...l, quantidade: l.quantidade + 1 } : l))
                    : [...c, { produto: p, receita, quantidade: 1 }];
                })
              }
            />
          ))}
        </div>
        <Cartao titulo={t.vitrine.carrinho}>
          {carrinho.length === 0 ? (
            <p className="suave">{t.vitrine.carrinhoVazio}</p>
          ) : (
            <>
              <table>
                <tbody>
                  {carrinho.map((l, i) => (
                    <tr key={i}>
                      <td>
                        {l.quantidade}× {l.produto.nome}
                        <div className="suave pequeno">
                          {fmtNum(l.receita.volume, idioma)} {t.unidades.litros} · {fmtNum(l.receita.temperatura, idioma)} {t.unidades.celsius}
                        </div>
                      </td>
                      <td className="num">{fmtMoeda(l.produto.preco * l.quantidade, idioma)}</td>
                      <td>
                        <button className="pequeno" onClick={() => setCarrinho((c) => c.filter((_, j) => j !== i))}>
                          {t.vitrine.remover}
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th>{t.comum.total}</th>
                    <th className="num">{fmtMoeda(total, idioma)}</th>
                    <th />
                  </tr>
                </tbody>
              </table>
              <h3>{t.vitrine.seusDados}</h3>
              <label>
                <span>{t.vitrine.nome}</span>
                <input value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} autoComplete="name" />
              </label>
              <MensagemErro erro={erroPedido} />
              <button className="primario" disabled={enviando || !cliente.nome.trim()} onClick={confirmar}>
                {enviando ? t.vitrine.enviando : t.vitrine.confirmar}
              </button>
              <p className="suave pequeno">{t.vitrine.semPagamento}</p>
            </>
          )}
        </Cartao>
      </div>
    </>
  );
}

function CartaoProduto({ produto, faixas, adicionar }: { produto: Produto; faixas: Catalogo['faixas']; adicionar: (r: Receita) => void }) {
  const { t, idioma } = useIdioma();
  const [receita, setReceita] = useState<Receita>(produto.receita);
  const erros = produto.sobMedida ? validarReceita(receita) : [];
  // no sob medida o cliente escolhe só volume e temperatura; vazão e pressão vêm do produto
  const campo = (chave: 'volume' | 'temperatura', rotulo: string, unidade: string, passo: number) => (
    <label>
      <span>
        {rotulo} ({unidade}) · {t.vitrine.faixa} {fmtNum(faixas[chave].min, idioma)}–{fmtNum(faixas[chave].max, idioma)}
      </span>
      <input
        type="number"
        step={passo}
        min={faixas[chave].min}
        max={faixas[chave].max}
        value={Number.isNaN(receita[chave]) ? '' : receita[chave]}
        onChange={(e) => setReceita({ ...receita, [chave]: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
        aria-invalid={erros.some((x) => x.campo === chave)}
      />
    </label>
  );

  return (
    <Cartao>
      <div className="produto">
        <h2>{produto.nome}</h2>
        {produto.descricao && <p className="suave pequeno">{produto.descricao}</p>}
        {produto.sobMedida ? (
          <>
            <p className="pequeno">{t.vitrine.sobMedida}</p>
            {campo('volume', t.comum.volume, t.unidades.litros, 0.5)}
            {campo('temperatura', t.comum.temperatura, t.unidades.celsius, 1)}
          </>
        ) : (
          <div className="ficha">
            <span>{fmtNum(produto.receita.volume, idioma)} {t.unidades.litros}</span>
            <span>{fmtNum(produto.receita.temperatura, idioma, 0)} {t.unidades.celsius} ±{fmtNum(produto.tolerancias.temperatura, idioma, 0)}</span>
            <span>{fmtNum(produto.receita.vazao, idioma)} {t.unidades.lmin}</span>
          </div>
        )}
        <div className="preco">{fmtMoeda(produto.preco, idioma)}</div>
        {produto.prazoEstimado && (
          <p className="suave pequeno">
            {t.vitrine.prontoPorVolta} {fmtHora(produto.prazoEstimado, idioma)}
          </p>
        )}
        <button className="primario" disabled={erros.length > 0} onClick={() => adicionar(receita)}>
          {t.vitrine.adicionar}
        </button>
      </div>
    </Cartao>
  );
}

export function Acompanhamento({ id }: { id: number }) {
  const { t, idioma } = useIdioma();
  // o andamento (etapa, temperatura e nível ao vivo) vem do MES pela Loja: busca de novo a cada 2 s e a cada aviso
  const { dados, erro } = useDados<Pedido>(`/api/loja/pedidos/${id}`, ['pedido', 'producao'], 2000);

  if (erro) return <p>{t.acompanhamento.naoEncontrado}</p>;
  if (!dados) return <Carregando />;
  return (
    <>
      <h1>
        {t.acompanhamento.titulo} {dados.id}
      </h1>
      <p className="suave">
        {dados.cliente.nome} · {t.acompanhamento.feitoEm} {fmtDataHora(dados.criadoEm, idioma)}
      </p>
      {dados.mesNoAr === false && <div className="aviso aviso-atencao">{t.vendas.mesForaDoAr}</div>}
      {dados.itens.map((item) => (
        <ItemAcompanhado key={item.id} item={item} />
      ))}
    </>
  );
}

function ItemAcompanhado({ item }: { item: ItemPedido }) {
  const { t, idioma } = useIdioma();
  const p = item.producao;
  const estado = p?.estado ?? 'na_fila';
  const processo = p?.processo ?? null;
  const etapa = p?.etapa ?? null;

  const ordem = ['fila', 'producao', 'inspecao', 'pronto'] as const;
  const atual =
    estado === 'na_fila' || estado === 'enviada' ? 0
    : estado === 'em_producao' || estado === 'comunicacao_perdida' ? 1
    : estado === 'produzida' ? 2
    : 3;
  const falhou = ['reprovada', 'recusada', 'abortada', 'cancelada'].includes(estado);

  return (
    <Cartao
      titulo={`${item.nomeProduto} · ${t.comum.op} ${item.numeroOp ?? '—'}`}
      extra={<SeloEstado estado={estado} />}
    >
      <div className="passos">
        {ordem.map((passo, i) => (
          <div key={passo} className={`passo ${i < atual ? 'feito' : ''} ${i === atual ? (falhou ? 'ruim' : 'atual') : ''}`}>
            {i === atual && falhou ? t.estadoOp[estado] : t.acompanhamento.passos[passo]}
            {i === 1 && i === atual && etapa ? ` · ${t.etapa[etapa]}` : ''}
          </div>
        ))}
      </div>
      <div className="numeros">
        <Numero rotulo={t.comum.volume} valor={fmtNum(item.receita.volume, idioma)} unidade={t.unidades.litros} />
        <Numero rotulo={t.comum.temperatura} valor={fmtNum(item.receita.temperatura, idioma, 0)} unidade={t.unidades.celsius} />
        {p?.posicaoFila && atual === 0 && <Numero rotulo={t.acompanhamento.posicao} valor={String(p.posicaoFila)} />}
        {p?.fimEstimado && atual <= 1 && <Numero rotulo={t.acompanhamento.previsao} valor={fmtHora(p.fimEstimado, idioma)} />}
        {item.prazo && <Numero rotulo={t.comum.prazo} valor={fmtHora(item.prazo, idioma)} />}
      </div>
      {processo && atual === 1 && (
        <>
          <h3>{t.acompanhamento.agora}</h3>
          <div className="numeros">
            <Numero rotulo={`${t.comum.temperatura} TQ-01`} valor={fmtNum(processo.temperatura, idioma)} unidade={t.unidades.celsius} />
            <Numero rotulo={`${t.comum.nivel} TQ-02`} valor={fmtNum(processo.nivel, idioma)} unidade={t.unidades.litros} />
          </div>
        </>
      )}
      {p?.batelada && (
        <p>
          <a className="botao" href={`#/certificado/${item.numeroOp}`}>
            {t.acompanhamento.certificado}
          </a>
        </p>
      )}
    </Cartao>
  );
}

export function Certificado({ numero }: { numero: number }) {
  const { t, idioma } = useIdioma();
  const { dados, erro } = useDados<TipoCertificado>(`/api/loja/certificado/${numero}`, ['producao']);
  if (erro) return <p>{t.certificado.naoDisponivel}</p>;
  if (!dados || !dados.batelada) return <Carregando />;
  const { ordem, batelada: b, avaliacao, inspecao } = dados;
  const linha = (rotulo: string, pedido: number, tol: number | null, medido: number, ok: boolean | undefined, unidade: string) => (
    <tr>
      <td>{rotulo}</td>
      <td className="num">{fmtNum(pedido, idioma)} {unidade}</td>
      <td className="num">{tol === null ? '' : `±${fmtNum(tol, idioma)}`}</td>
      <td className="num">{fmtNum(medido, idioma, 2)} {unidade}</td>
      <td>{ok === undefined ? '' : <Selo tom={ok ? 'ok' : 'ruim'}>{ok ? t.certificado.dentro : t.certificado.fora}</Selo>}</td>
    </tr>
  );

  return (
    <div className="certificado">
      <div className="linha nao-imprimir">
        <span className="espaco" />
        <button className="primario" onClick={() => window.print()}>
          {t.certificado.imprimir}
        </button>
      </div>
      <Cartao>
        <h1>
          {t.titulo} · {t.certificado.titulo}
        </h1>
        <p>
          <strong>
            {t.comum.op} {ordem.numero}
          </strong>
          {dados.item && ` · ${dados.item.nomeProduto}`}
          {dados.cliente && ` · ${dados.cliente.nome}${dados.cliente.turma ? ` (${dados.cliente.turma})` : ''}`}
        </p>
        <p>
          <SeloEstado estado={ordem.situacao.estado} />
        </p>

        <h3>{t.certificado.receitaMedido}</h3>
        <table>
          <thead>
            <tr>
              <th />
              <th className="num">{t.comum.pedidoValor}</th>
              <th className="num">{t.comum.tolerancia}</th>
              <th className="num">{t.comum.medido}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linha(t.comum.volume, ordem.receita.volume, ordem.tolerancias.volume, b.volume, avaliacao?.volumeOk, t.unidades.litros)}
            {linha(t.comum.temperatura, ordem.receita.temperatura, ordem.tolerancias.temperatura, b.temperatura, avaliacao?.temperaturaOk, t.unidades.celsius)}
            <tr>
              <td>{t.comum.vazao}</td>
              <td className="num">{fmtNum(ordem.receita.vazao, idioma)} {t.unidades.lmin}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>

        <h3>{t.certificado.curva}</h3>
        <Grafico
          series={[
            { nome: t.comum.temperatura, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: dados.leituras.map((l) => [l.horario, l.temperatura]) },
            { nome: t.comum.nivel, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: dados.leituras.map((l) => [l.horario, l.nivel]) },
          ]}
        />

        <div className="colunas">
          <div>
            <h3>{t.certificado.tempos}</h3>
            <table>
              <tbody>
                <tr><td>{t.etapa[1]}</td><td className="num">{fmtDuracao(b.tempos.pressurizar)}</td></tr>
                <tr><td>{t.etapa[2]}</td><td className="num">{fmtDuracao(b.tempos.aquecer)}</td></tr>
                <tr><td>{t.etapa[6]}</td><td className="num">{fmtDuracao(b.tempos.resfriar)}</td></tr>
                <tr><td>{t.etapa[3]}</td><td className="num">{fmtDuracao(b.tempos.transferir)}</td></tr>
                <tr><td>{t.etapa[5]}</td><td className="num">{fmtDuracao(b.tempos.devolver)}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>{t.certificado.horarios}</h3>
            <table>
              <tbody>
                <tr><td>{t.certificado.chegada}</td><td className="num">{fmtDataHora(ordem.chegada, idioma)}</td></tr>
                <tr><td>{t.certificado.recebida}</td><td className="num">{fmtDataHora(ordem.recebidaEm, idioma)}</td></tr>
                <tr><td>{t.certificado.concluida}</td><td className="num">{fmtDataHora(ordem.concluidaEm, idioma)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <h3>{t.certificado.inspecao}</h3>
        {inspecao ? (
          <p>
            <Selo tom={inspecao.resultado === 'aprovada' ? 'ok' : 'ruim'}>{t.estadoOp[inspecao.resultado]}</Selo> · {t.certificado.automatica} ·{' '}
            {fmtDataHora(inspecao.horario, idioma)}
          </p>
        ) : (
          <p className="suave">{t.certificado.semInspecao}</p>
        )}
      </Cartao>
    </div>
  );
}
