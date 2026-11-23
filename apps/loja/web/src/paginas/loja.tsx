// Acompanhamento ao vivo do pedido e certificado da batelada. A vitrine (o pedido em passos) fica em vitrine.tsx.

import { useIdioma } from '../i18n/index.ts';
import {
  Aviso, Botao, COR_NIVEL, COR_TEMPERATURA, Carregando, Cartao, ErroApi, FalhaAoCarregar, Grafico, Icone,
  Numero, Pagina, Progresso, Selo, SeloEstado, Vazio,
  fmtDataHora, fmtDuracao, fmtHora, fmtMoeda, fmtNum, tomDoEstado, useDados,
} from '@aupro/interface';
import type { Certificado as TipoCertificado, EstadoOp, ItemPedido, Pedido } from '@aupro/interface';

// ---------------- acompanhamento ----------------

const ESTADOS_FINAIS: EstadoOp[] = ['aprovada', 'reprovada', 'recusada', 'abortada', 'cancelada'];

export function Acompanhamento({ id }: { id: number }) {
  const { t, idioma } = useIdioma();
  // o andamento (etapa, temperatura e nível ao vivo) vem do MES pela Loja: busca de novo a cada 2 s e a cada aviso
  const { dados, erro, recarregar } = useDados<Pedido>(Number.isInteger(id) && id > 0 ? `/api/loja/pedidos/${id}` : null, ['pedido', 'producao', 'reiniciado'], 2000);
  const voltar = { href: '#/', rotulo: t.acompanhamento.voltar };

  if (!Number.isInteger(id) || id <= 0 || (erro instanceof ErroApi && erro.status === 404)) {
    return (
      <Pagina titulo={`${t.acompanhamento.titulo} ${Number.isFinite(id) ? id : ''}`} voltar={voltar}>
        <Cartao>
          <Vazio icone="documento" titulo={t.acompanhamento.naoEncontrado} />
        </Cartao>
      </Pagina>
    );
  }
  if (!dados) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;
  const aprovados = dados.itens.filter((i) => i.producao?.estado === 'aprovada').length;
  return (
    <Pagina
      titulo={`${t.acompanhamento.titulo} ${dados.id}`}
      subtitulo={`${dados.cliente.nome} · ${t.acompanhamento.feitoEm} ${fmtDataHora(dados.criadoEm, idioma)}`}
      voltar={voltar}
      acoes={
        <Selo tom={aprovados === dados.itens.length ? 'ok' : 'neutro'} grande>
          {aprovados}/{dados.itens.length} {t.acompanhamento.resumo}
        </Selo>
      }
    >
      {dados.mesNoAr === false && <Aviso tom="atencao">{t.vendas.mesForaDoAr}</Aviso>}
      {dados.itens.map((item) => (
        <ItemAcompanhado key={item.id} item={item} semMes={dados.mesNoAr === false} />
      ))}
    </Pagina>
  );
}

function ItemAcompanhado({ item, semMes }: { item: ItemPedido; semMes: boolean }) {
  const { t, idioma } = useIdioma();
  const p = item.producao;
  const estado = p?.estado ?? null;
  const processo = p?.processo ?? null;

  const ordem = ['fila', 'producao', 'inspecao', 'pronto'] as const;
  // em que passo o item está; os estados que encerram sem aprovar marcam de vermelho o passo onde pararam
  const atual =
    estado === null || estado === 'na_fila' || estado === 'enviada' || estado === 'cancelada' || estado === 'recusada' ? 0
    : estado === 'em_producao' || estado === 'comunicacao_perdida' || estado === 'abortada' ? 1
    : estado === 'produzida' ? 2
    : 3;
  const falhou = estado !== null && estado !== 'aprovada' && ESTADOS_FINAIS.includes(estado);
  const aprovado = estado === 'aprovada';
  const apoio = (i: number): string | null => {
    if (i !== atual || !p) return null;
    if (p.recusa) return `${t.estadoOp[estado!]}: ${t.recusa[p.recusa] ?? p.recusa}`;
    if (falhou || estado === 'comunicacao_perdida') return t.estadoOp[estado!];
    if (i === 0) return [p.posicaoFila ? `${t.acompanhamento.posicao} ${p.posicaoFila}` : null, p.fimEstimado ? `${t.acompanhamento.previsao} ${fmtHora(p.fimEstimado, idioma, false)}` : null].filter(Boolean).join(' · ') || null;
    if (i === 1) return [p.etapa ? t.etapa[p.etapa] : null, p.fimEstimado ? `${t.acompanhamento.previsao} ${fmtHora(p.fimEstimado, idioma, false)}` : null].filter(Boolean).join(' · ') || null;
    return null;
  };

  return (
    <Cartao
      titulo={
        <>
          {item.nomeProduto}{' '}
          <span className="suave pequeno">· {item.numeroOp ? `${t.comum.op} ${item.numeroOp}` : t.acompanhamento.semOp}</span>
        </>
      }
      extra={estado ? <SeloEstado estado={estado} /> : semMes ? <Selo tom="neutro">{t.vendas.semAndamento}</Selo> : null}
    >
      {estado && (
        <ol className="passos">
          {ordem.map((passo, i) => {
            const classe = i < atual || (aprovado && i === atual) ? 'feito' : i === atual ? (falhou ? 'ruim' : `atual${i === 1 ? ' pulsa' : ''}`) : '';
            return (
              <li key={passo} className={`passo ${classe}`} aria-current={i === atual ? 'step' : undefined}>
                <span className="passo-marca">
                  {classe === 'feito' ? <Icone nome="certo" tamanho={16} /> : classe === 'ruim' ? <Icone nome="fechar" tamanho={16} /> : i + 1}
                </span>
                <span className="passo-nome">{t.acompanhamento.passos[passo]}</span>
                {apoio(i) && <span className="passo-apoio">{apoio(i)}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {processo && estado === 'em_producao' && (
        <>
          <div className="marca-ao-vivo">{t.acompanhamento.aoVivo}</div>
          <div className="ao-vivo" style={{ marginTop: '.5rem' }}>
            <div className="numero">
              <div className="numero-rotulo"><Icone nome="termometro" tamanho={15} /> {t.comum.temperatura}</div>
              <div className="numero-valor">
                {fmtNum(processo.temperatura, idioma)} <span className="numero-unidade">{t.unidades.celsius}</span>
              </div>
              <Progresso tom="temperatura" valor={processo.temperatura} max={item.receita.temperatura} rotulo={t.comum.temperatura} />
              <div className="numero-apoio">{t.acompanhamento.alvo} {fmtNum(item.receita.temperatura, idioma, 0)} {t.unidades.celsius}</div>
            </div>
            <div className="numero">
              <div className="numero-rotulo"><Icone nome="gota" tamanho={15} /> {t.comum.volume}</div>
              <div className="numero-valor">
                {fmtNum(processo.nivel, idioma)} <span className="numero-unidade">{t.unidades.litros}</span>
              </div>
              <Progresso tom="nivel" valor={processo.nivel} max={item.receita.volume} rotulo={t.comum.volume} />
              <div className="numero-apoio">{t.acompanhamento.alvo} {fmtNum(item.receita.volume, idioma)} {t.unidades.litros}</div>
            </div>
          </div>
        </>
      )}

      <div className="numeros">
        <Numero icone="gota" rotulo={t.comum.volume} valor={fmtNum(item.receita.volume, idioma)} unidade={t.unidades.litros}
          apoio={p?.batelada ? `${t.comum.medido} ${fmtNum(p.batelada.volume, idioma, 2)} ${t.unidades.litros}` : undefined} />
        <Numero icone="termometro" rotulo={t.comum.temperatura} valor={fmtNum(item.receita.temperatura, idioma, 0)} unidade={t.unidades.celsius}
          apoio={p?.batelada ? `${t.comum.medido} ${fmtNum(p.batelada.temperatura, idioma, 2)} ${t.unidades.celsius}` : undefined} />
        {item.prazo && <Numero icone="relogio" rotulo={t.comum.prazo} valor={fmtHora(item.prazo, idioma, false)} />}
        <Numero rotulo={t.comum.preco} valor={fmtMoeda(item.preco, idioma)} />
      </div>
      {p?.batelada && (
        <a className="botao" href={`#/certificado/${item.numeroOp}`}>
          <Icone nome="documento" /> {t.acompanhamento.certificado}
        </a>
      )}
    </Cartao>
  );
}

// ---------------- certificado ----------------

export function Certificado({ numero }: { numero: number }) {
  const { t, idioma } = useIdioma();
  const valido = Number.isInteger(numero) && numero > 0;
  const { dados, erro, recarregar } = useDados<TipoCertificado>(valido ? `/api/loja/certificado/${numero}` : null, ['producao']);
  if (!valido || (erro instanceof ErroApi && erro.status === 404) || (dados && !dados.batelada)) {
    return (
      <Pagina titulo={t.certificado.titulo} voltar={{ href: '#/pedidos', rotulo: t.menu.pedidos }}>
        <Cartao>
          <Vazio icone="documento" titulo={t.certificado.naoDisponivel} />
        </Cartao>
      </Pagina>
    );
  }
  if (!dados || !dados.batelada) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;
  const { ordem, batelada: b, avaliacao, inspecao } = dados;
  const estado = ordem.situacao.estado;
  const tom = tomDoEstado(estado);
  const linha = (rotulo: string, pedido: number, tol: number, medido: number, desvio: number | undefined, ok: boolean | undefined, unidade: string) => (
    <tr>
      <th scope="row">{rotulo}</th>
      <td className="num">{fmtNum(pedido, idioma)} {unidade}</td>
      <td className="num">±{fmtNum(tol, idioma)} {unidade}</td>
      <td className="num"><strong>{fmtNum(medido, idioma, 2)} {unidade}</strong></td>
      <td className="num">{desvio === undefined ? '—' : `${desvio > 0 ? '+' : ''}${fmtNum(desvio, idioma, 2)}`}</td>
      <td>{ok === undefined ? '' : <Selo tom={ok ? 'ok' : 'ruim'}>{ok ? t.certificado.dentro : t.certificado.fora}</Selo>}</td>
    </tr>
  );

  return (
    <div className="certificado">
      <div className="linha nao-imprimir" style={{ marginBottom: '1rem' }}>
        {dados.item && (
          <a className="voltar" style={{ margin: 0 }} href={`#/pedido/${dados.item.pedidoId}`}>
            <Icone nome="voltar" tamanho={16} /> {t.acompanhamento.titulo} {dados.item.pedidoId}
          </a>
        )}
        <span className="espaco" />
        <Botao variante="primario" icone="imprimir" onClick={() => window.print()}>
          {t.certificado.imprimir}
        </Botao>
      </div>
      <Cartao className="certificado-folha">
        <header className="certificado-cabeca">
          <div>
            <div className="sobre">{t.titulo}</div>
            <h1>{t.certificado.titulo}</h1>
          </div>
          <div className={`carimbo ${tom === 'ok' ? 'ok' : tom === 'ruim' ? 'ruim' : 'neutro'}`}>{t.estadoOp[estado]}</div>
        </header>
        <dl className="certificado-dados">
          <div><dt>{t.comum.op}</dt><dd>{ordem.numero}</dd></div>
          {dados.item && <div><dt>{t.comum.produto}</dt><dd>{dados.item.nomeProduto}</dd></div>}
          {dados.cliente && <div><dt>{t.comum.cliente}</dt><dd>{dados.cliente.nome}</dd></div>}
          {dados.item && <div><dt>{t.comum.pedido}</dt><dd>{dados.item.pedidoId}</dd></div>}
        </dl>

        <h3>{t.certificado.receitaMedido}</h3>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th />
                <th className="num">{t.comum.pedidoValor}</th>
                <th className="num">{t.comum.tolerancia}</th>
                <th className="num">{t.comum.medido}</th>
                <th className="num">{t.comum.desvio}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linha(t.comum.volume, ordem.receita.volume, ordem.tolerancias.volume, b.volume, avaliacao?.desvioVolume, avaliacao?.volumeOk, t.unidades.litros)}
              {linha(t.comum.temperatura, ordem.receita.temperatura, ordem.tolerancias.temperatura, b.temperatura, avaliacao?.desvioTemperatura, avaliacao?.temperaturaOk, t.unidades.celsius)}
              <tr>
                <th scope="row">{t.comum.vazao}</th>
                <td className="num">{fmtNum(ordem.receita.vazao, idioma)} {t.unidades.lmin}</td>
                <td colSpan={4} />
              </tr>
              <tr>
                <th scope="row">{t.comum.pressao}</th>
                <td className="num">{fmtNum(ordem.receita.pressao, idioma)} {t.unidades.bar}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>

        <h3>{t.certificado.curva}</h3>
        <Grafico
          altura={130}
          series={[
            { nome: t.comum.temperatura, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: dados.leituras.map((l) => [l.horario, l.temperatura]), meta: { valor: ordem.receita.temperatura, rotulo: t.comum.meta } },
            { nome: t.comum.nivel, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: dados.leituras.map((l) => [l.horario, l.nivel]), meta: { valor: ordem.receita.volume, rotulo: t.comum.meta } },
          ]}
        />

        <div className="metades">
          <div>
            <h3>{t.certificado.tempos}</h3>
            <table className="simples">
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
            <table className="simples">
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
            <Selo tom={inspecao.resultado === 'aprovada' ? 'ok' : 'ruim'}>{t.estadoOp[inspecao.resultado]}</Selo> {t.certificado.automatica} · {fmtDataHora(inspecao.horario, idioma)}
          </p>
        ) : (
          <p className="suave">{t.certificado.semInspecao}</p>
        )}
      </Cartao>
    </div>
  );
}
