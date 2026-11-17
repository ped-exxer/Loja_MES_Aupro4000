// Telas do MES: fila, bancada, qualidade (só leitura), indicadores, detalhe da OP.

import { useEffect, useRef, useState } from 'react';
import { FAIXAS, ORIGEM_LOJA } from '@aupro/dominio';
import { useIdioma, type Textos } from '../i18n/index.ts';
import { useBancada } from '../bancada.ts';
import {
  Anel, Aviso, Botao, COR_NIVEL, COR_TEMPERATURA, Carregando, Cartao, Confirmacao, Dialogo, Entrada, ErroApi, FalhaAoCarregar, Grafico, Icone,
  MensagemErro, Numero, Pagina, Progresso, Selecao, Selo, SeloEstado, Vazio,
  api, erroDoCampo, fmtDataHora, fmtDuracao, fmtHora, fmtNum, fmtPct, numeroDe, useAcao, useDados, useOutroSistema,
} from '@aupro/interface';
import type { Dossie, Evento, Indicadores as TipoIndicadores, ItemFila, Ordem, Parada } from '@aupro/interface';

// OP da Loja: "Loja #<item>"; o certificado é uma página da Loja (link para o outro sistema)
const origem = (o: { origem: string | null }, t: Textos) =>
  o.origem === 'manual' || !o.origem ? t.comum.manual : o.origem.replace(ORIGEM_LOJA, `${t.sistema.loja} #`);

/** O detalhe de um registro, traduzido quando é um código (motivo da parada, origem da OP). */
function detalheDoEvento(e: Evento, t: Textos): string | null {
  if (!e.detalhe) return null;
  if (e.tipo === 'parada_inicio') return t.motivoParada[e.detalhe] ?? e.detalhe;
  if (e.tipo === 'parada_fim') return null;
  if (e.tipo === 'criada' || e.tipo === 'emissao_repetida') return origem({ origem: e.detalhe }, t);
  if (e.tipo === 'substituida') return e.detalhe.replace(/^OP /, `${t.comum.op} `);
  if (e.tipo === 'fixada') return e.detalhe === 'livre' ? t.pcp.soltar : `${t.pcp.posicao} ${e.detalhe}`;
  // "Alarme 2" e "Resultado 3": o código do CLP vira o texto do intertravamento ou do motivo da recusa
  const codigo = /^(Alarme|Resultado) (\d+)$/.exec(e.detalhe);
  if (codigo) return (codigo[1] === 'Alarme' ? t.alarme : t.recusa)[Number(codigo[2])] ?? e.detalhe;
  return t.motivoQueda[e.detalhe] ?? e.detalhe;
}

// ---------------- Fila ----------------

export function Fila() {
  const { t, idioma } = useIdioma();
  const { dados, erro, recarregar } = useDados<ItemFila[]>('/api/mes/fila', ['ordem', 'reiniciado'], 5000);
  const acao = useAcao();
  const [nova, setNova] = useState(false);
  const [cancelando, setCancelando] = useState<Ordem | null>(null);

  const fixar = (o: Ordem, posicao: number | null) =>
    acao.executar(`fixar-${o.numero}`, async () => {
      await api(`/api/mes/ordens/${o.numero}/fixar`, { corpo: { posicao } });
      await recarregar();
      return `${t.comum.op} ${o.numero} ${posicao === null ? t.pcp.soltaOk : t.pcp.fixadaOk}`;
    }, { erroNoAviso: true });

  const cancelar = (o: Ordem) =>
    acao.executar(`cancelar-${o.numero}`, async () => {
      const r = await api<{ resultado?: string }>(`/api/mes/ordens/${o.numero}/cancelar`, { corpo: {} });
      setCancelando(null);
      await recarregar();
      return r.resultado === 'pendente' ? t.pcp.cancelamentoPendente : `${t.comum.op} ${o.numero} ${t.pcp.cancelada}`;
    }, { erroNoAviso: true }).then((ok) => ok || setCancelando(null));

  const produzindo = (dados ?? []).filter((f) => f.ordem.situacao.estado === 'em_producao' || f.ordem.situacao.estado === 'comunicacao_perdida').length;
  return (
    <Pagina
      titulo={t.pcp.fila}
      subtitulo={t.pcp.filaTexto}
      acoes={
        <Botao variante="primario" icone="mais" onClick={() => setNova(true)}>
          {t.pcp.novaOp}
        </Botao>
      }
    >
      <Cartao>
        {dados && dados.length > 0 && (
          <div className="resumo" style={{ marginBottom: '1rem' }}>
            <Selo tom={produzindo > 0 ? 'info' : 'neutro'}>{produzindo} {t.pcp.emProducao}</Selo>
            <Selo tom="neutro">{dados.length - produzindo} {t.pcp.naFila}</Selo>
          </div>
        )}
        {!dados ? (
          erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />
        ) : dados.length === 0 ? (
          <Vazio icone="lista" titulo={t.pcp.vazia}>
            <Botao icone="mais" onClick={() => setNova(true)}>{t.pcp.novaOp}</Botao>
          </Vazio>
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>{t.pcp.posicao}</th>
                  <th>{t.comum.op}</th>
                  <th>{t.comum.origem}</th>
                  <th className="num">{t.comum.temperatura}</th>
                  <th className="num">{t.comum.volume}</th>
                  <th className="num">{t.comum.vazao}</th>
                  <th>{t.comum.prazo}</th>
                  <th>{t.pcp.inicio}</th>
                  <th>{t.pcp.fim}</th>
                  <th>{t.comum.estado}</th>
                  <th><span className="so-leitor">{t.comum.acoes}</span></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((f) => {
                  const o = f.ordem;
                  const estado = o.situacao.estado;
                  const mexe = estado === 'na_fila' || estado === 'enviada';
                  const atrasada = f.fimEstimado > o.prazo;
                  return (
                    <tr key={o.numero} className={mexe ? '' : 'destaque'}>
                      <td><span className="posicao">{f.posicao}</span></td>
                      <td>
                        <a href={`#/op/${o.numero}`}><strong>{t.comum.op} {o.numero}</strong></a>
                      </td>
                      <td className="inteiro">{origem(o, t)}</td>
                      <td className="num">{fmtNum(o.receita.temperatura, idioma, 0)} {t.unidades.celsius}</td>
                      <td className="num">{fmtNum(o.receita.volume, idioma)} {t.unidades.litros}</td>
                      <td className="num">{fmtNum(o.receita.vazao, idioma)} {t.unidades.lmin}</td>
                      <td className="num" style={{ textAlign: 'left' }}>
                        {fmtHora(o.prazo, idioma)}
                        {atrasada && <div><Selo tom="atencao">{t.pcp.emRisco}</Selo></div>}
                      </td>
                      <td className="num" style={{ textAlign: 'left' }}>{fmtHora(f.inicioEstimado, idioma)}</td>
                      <td className="num" style={{ textAlign: 'left' }}>{fmtHora(f.fimEstimado, idioma)}</td>
                      <td>
                        <SeloEstado estado={estado} />
                        {o.fixada !== null && mexe && (
                          <div className="suave pequeno"><Icone nome="pino" tamanho={13} /> {t.pcp.fixada} {o.fixada}</div>
                        )}
                        {o.cancelarAoRetirar && <div className="suave pequeno">{t.pcp.cancelamentoPendente}</div>}
                      </td>
                      <td className="acoes">
                        {mexe && (
                          <div className="linha">
                            {o.fixada === null ? (
                              <Botao pequeno icone="pino" ocupado={acao.ocupado === `fixar-${o.numero}`} onClick={() => fixar(o, 1)} aria-label={`${t.pcp.fixar}: ${t.comum.op} ${o.numero}`}>
                                {t.pcp.fixar}
                              </Botao>
                            ) : (
                              <Botao pequeno ocupado={acao.ocupado === `fixar-${o.numero}`} onClick={() => fixar(o, null)} aria-label={`${t.pcp.soltar}: ${t.comum.op} ${o.numero}`}>
                                {t.pcp.soltar}
                              </Botao>
                            )}
                            <Botao pequeno variante="perigo" onClick={() => setCancelando(o)} aria-label={`${t.pcp.cancelarOp} ${o.numero}`}>
                              {t.comum.cancelar}
                            </Botao>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      <NovaOp aberto={nova} aoFechar={() => setNova(false)} aoCriar={recarregar} />
      <Confirmacao
        aberto={cancelando !== null}
        titulo={t.pcp.cancelarTitulo}
        texto={
          <>
            <strong>{t.comum.op} {cancelando?.numero}</strong>. {t.pcp.cancelarTexto}
          </>
        }
        confirmar={t.pcp.cancelarOp}
        perigo
        ocupado={cancelando !== null && acao.ocupado === `cancelar-${cancelando.numero}`}
        aoConfirmar={() => cancelando && cancelar(cancelando)}
        aoFechar={() => setCancelando(null)}
      />
    </Pagina>
  );
}

const OP_PADRAO = { volume: '10', temperatura: '45', vazao: '4', pressao: '2', tolTemperatura: '2', tolVolume: '0.5' };
// campo do formulário → campo do erro que a API devolve
const CAMPO_OP = {
  volume: 'volume', temperatura: 'temperatura', vazao: 'vazao', pressao: 'pressao', tolTemperatura: 'tolerancia.temperatura', tolVolume: 'tolerancia.volume',
} as const;

function NovaOp({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: () => Promise<void> }) {
  const { t, idioma } = useIdioma();
  const [v, setV] = useState(OP_PADRAO);
  const acao = useAcao();
  const fechar = () => {
    acao.limparErro();
    aoFechar();
  };
  const campo = (chave: keyof typeof OP_PADRAO, rotulo: string) => {
    const faixa = chave in FAIXAS ? FAIXAS[chave as keyof typeof FAIXAS] : null;
    return (
      <Entrada
        rotulo={rotulo}
        type="number"
        inputMode="decimal"
        step="any"
        value={v[chave]}
        onChange={(e) => setV({ ...v, [chave]: e.target.value })}
        dica={faixa ? `${t.pcp.faixa} ${fmtNum(faixa.min, idioma)} ${t.pcp.ate} ${fmtNum(faixa.max, idioma)}` : undefined}
        erro={erroDoCampo(acao.erro, CAMPO_OP[chave], t)}
      />
    );
  };
  const criar = () =>
    acao.executar('criar', async () => {
      const r = await api<{ numero: number }>('/api/mes/ordens', { corpo: Object.fromEntries(Object.entries(v).map(([k, texto]) => [k, numeroDe(texto)])) });
      aoFechar();
      await aoCriar();
      return `${t.comum.op} ${r.numero} ${t.pcp.criada}`;
    });
  return (
    <Dialogo
      aberto={aberto}
      titulo={t.pcp.novaOp}
      aoFechar={fechar}
      rodape={
        <>
          <Botao onClick={fechar}>{t.comum.cancelar}</Botao>
          <Botao variante="primario" type="submit" form="form-op" ocupado={acao.ocupado === 'criar'}>{t.pcp.criar}</Botao>
        </>
      }
    >
      <p className="suave">{t.pcp.novaOpTexto}</p>
      <form
        id="form-op"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void criar();
        }}
      >
        <div className="campos">
          {campo('volume', `${t.comum.volume} (${t.unidades.litros})`)}
          {campo('temperatura', `${t.comum.temperatura} (${t.unidades.celsius})`)}
          {campo('vazao', `${t.comum.vazao} (${t.unidades.lmin})`)}
          {campo('pressao', `${t.comum.pressao} (${t.unidades.bar})`)}
          {campo('tolTemperatura', `${t.campos['tolerancia.temperatura']} (±${t.unidades.celsius})`)}
          {campo('tolVolume', `${t.campos['tolerancia.volume']} (±${t.unidades.litros})`)}
        </div>
        <MensagemErro erro={acao.erro} campos={Object.values(CAMPO_OP)} />
      </form>
    </Dialogo>
  );
}

// ---------------- Bancada ----------------

// a ordem em que as etapas aparecem na batelada (aquecer ou resfriar, conforme a água do reservatório)
const ETAPAS = [1, 2, 6, 3, 4, 5];

export function Bancada() {
  const { t, idioma } = useIdioma();
  const { bancada: b, historico } = useBancada();
  const fila = useDados<ItemFila[]>('/api/mes/fila', ['ordem', 'reiniciado'], 5000);
  const eventos = useDados<Evento[]>('/api/mes/eventos', ['ordem', 'parada', 'alarme', 'reiniciado'], 10_000);

  if (!b) return <Carregando />;
  const p = b.processo;
  const semClp = !b.conectado || !b.clpVivo || b.comunicacaoPerdida;
  const alarme = b.alarme ? (t.alarme[b.alarme] ?? `${t.bancada.alarme} ${b.alarme}`) : null;
  const emProducao = b.opExecucao ? (fila.dados?.find((f) => f.ordem.numero === b.opExecucao)?.ordem ?? null) : null;
  const receita = emProducao?.receita ?? null;
  const classe = semClp || alarme || b.estadoClp === 3 ? 'falha' : b.estadoClp === 1 ? 'produzindo' : b.estadoClp === 2 ? 'parado' : 'ocioso';
  const titulo = !b.conectado ? t.bancada.desconectado : !b.clpVivo ? t.bancada.clpParado : alarme ? alarme : b.estadoClp === null ? '—' : (t.estadoClp[b.estadoClp] ?? String(b.estadoClp));
  const alvo = (valor: number | undefined, casas: number, unidade: string) =>
    valor === undefined ? '' : `${t.comum.meta} ${fmtNum(valor, idioma, casas)} ${unidade}`;

  return (
    <>
      <section className={`estado-bancada ${classe}`} aria-label={t.bancada.estadoClp} aria-live="polite">
        <div>
          <div className="sobre">
            {alarme && b.conectado && b.clpVivo ? `${t.bancada.alarmeAtivo} · ${b.estadoClp === null ? '' : (t.estadoClp[b.estadoClp] ?? b.estadoClp)}` : t.bancada.estadoClp} · {t.bancada.drivers[b.driver ?? ''] ?? b.driver ?? '—'}
          </div>
          <div className="grande">{titulo}</div>
          <div className="apoio">
            {b.opExecucao ? (
              <>
                <a href={`#/op/${b.opExecucao}`}><strong>{t.comum.op} {b.opExecucao}</strong></a>
                {b.etapa ? ` · ${t.etapa[b.etapa] ?? b.etapa}` : ''}
                {receita && ` · ${fmtNum(receita.volume, idioma)} ${t.unidades.litros} · ${fmtNum(receita.temperatura, idioma, 0)} ${t.unidades.celsius}`}
              </>
            ) : (
              t.bancada.semProducao
            )}
            {b.disponivel ? ` · ${t.bancada.disponivel}: ${t.comum.op} ${b.disponivel}` : ''}
          </div>
        </div>
        <div className="sinais">
          <span className={`sinal${b.conectado ? '' : ' ruim'}`}>
            <Icone nome={b.conectado ? 'sinal' : 'semSinal'} tamanho={16} /> {b.conectado ? t.bancada.conectado : t.bancada.desconectado}
          </span>
          {b.conectado && (
            <span className={`sinal${b.clpVivo ? '' : ' ruim'}`}>
              <Icone nome={b.clpVivo ? 'certo' : 'alerta'} tamanho={16} /> {b.clpVivo ? t.bancada.clpVivo : t.bancada.clpParado}
            </span>
          )}
          {alarme && (
            <span className="sinal ruim">
              <Icone nome="alerta" tamanho={16} /> {t.bancada.alarme} {b.alarme}: {alarme}
            </span>
          )}
        </div>
      </section>
      {b.comunicacaoPerdida && <Aviso tom="ruim">{t.bancada.comunicacaoPerdida}</Aviso>}
      {b.erro && !b.comunicacaoPerdida && <Aviso tom="atencao">{t.motivoQueda[b.erro] ?? b.erro}</Aviso>}

      <ol className="etapas" aria-label={t.bancada.etapas}>
        {ETAPAS.map((e) => (
          <li key={e} className={b.etapa === e ? 'atual' : ''} aria-current={b.etapa === e ? 'step' : undefined}>
            {b.etapa === e && <Icone nome="tocar" tamanho={14} />} {t.etapa[e]}
          </li>
        ))}
      </ol>

      {p ? (
        <section className="instrumentos" aria-label={t.bancada.instrumentos}>
          <Instrumento tag="TIT-104" nome={t.bancada.tq01} valor={fmtNum(p.temperatura, idioma)} unidade={t.unidades.celsius} alvo={alvo(receita?.temperatura, 0, t.unidades.celsius)}
            barra={receita ? { valor: p.temperatura, max: receita.temperatura, tom: 'temperatura' } : undefined} />
          <Instrumento tag="LIT-101" nome={t.bancada.tq02Nivel} valor={fmtNum(p.nivel, idioma)} unidade={t.unidades.litros} alvo={alvo(receita?.volume, 1, t.unidades.litros)}
            barra={receita ? { valor: p.nivel, max: receita.volume, tom: 'nivel' } : undefined} />
          <Instrumento tag="PIT-103" nome={t.bancada.pressao} valor={fmtNum(p.pressao, idioma, 2)} unidade={t.unidades.bar} alvo={alvo(receita?.pressao, 1, t.unidades.bar)} />
          <Instrumento tag="FIT-102" nome={t.bancada.vazao} valor={fmtNum(p.vazao, idioma)} unidade={t.unidades.lmin} alvo={alvo(receita?.vazao, 1, t.unidades.lmin)} />
          <Instrumento tag="TE-105a" nome={t.bancada.tq02} valor={fmtNum(b.temperaturaTq02, idioma)} unidade={t.unidades.celsius} />
          <Instrumento tag="TE-105b" nome={t.bancada.reservatorio} valor={fmtNum(b.temperaturaReservatorio, idioma)} unidade={t.unidades.celsius} />
        </section>
      ) : (
        <Aviso tom="info">{t.bancada.semProcesso}</Aviso>
      )}

      {p && (
        <Cartao titulo={t.bancada.curva}>
          <Grafico
            series={[
              { nome: `${t.comum.temperatura} TIT-104`, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: historico.map((h) => [h.horario, h.temperatura]), meta: receita ? { valor: receita.temperatura, rotulo: t.comum.meta } : undefined },
              { nome: `${t.comum.nivel} LIT-101`, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: historico.map((h) => [h.horario, h.nivel]), meta: receita ? { valor: receita.volume, rotulo: t.comum.meta } : undefined },
            ]}
          />
        </Cartao>
      )}

      <div className="metades">
        <Paradas />
        <Cartao titulo={t.bancada.eventos}>
          {!eventos.dados ? (
            <Carregando />
          ) : eventos.dados.length === 0 ? (
            <Vazio icone="lista" titulo={t.bancada.semEventos} />
          ) : (
            <ul className="lista-eventos">
              {eventos.dados.slice(0, 40).map((e, i) => (
                <li key={i}>
                  <time>{fmtHora(e.horario, idioma)}</time>
                  <span>
                    {e.numeroOp ? <a href={`#/op/${e.numeroOp}`}>{t.comum.op} {e.numeroOp}</a> : null}
                    {e.numeroOp ? ' · ' : ''}
                    <strong>{t.evento[e.tipo] ?? e.tipo}</strong>
                  </span>
                  {detalheDoEvento(e, t) && <span className="evento-apoio">{detalheDoEvento(e, t)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {b.driver === 'simulado' && <FalhasSimulador congelado={b.conectado && !b.clpVivo} alarmado={Boolean(b.alarme)} produzindo={b.opExecucao !== null && b.opExecucao !== 0} />}
    </>
  );
}

function Instrumento({ tag, nome, valor, unidade, alvo, barra }: {
  tag: string; nome: string; valor: string; unidade: string; alvo?: string; barra?: { valor: number; max: number; tom: 'temperatura' | 'nivel' };
}) {
  return (
    <div className="instrumento">
      <span className="tag">{tag}</span>
      <div className="nome">{nome}</div>
      <div className="valor">
        {valor} <span className="unidade">{unidade}</span>
      </div>
      {barra && <Progresso valor={barra.valor} max={barra.max} tom={barra.tom} rotulo={nome} />}
      <div className="alvo">{alvo}</div>
    </div>
  );
}

/** Relógio que anda sozinho enquanto a parada está aberta. */
function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    if (!ativo) return;
    const r = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(r);
  }, [ativo]);
  return agora;
}

function Paradas() {
  const { t, idioma } = useIdioma();
  // `sugerido`: o motivo que casa com o alarme ativo no CLP (quando a API o informa)
  const { dados, erro, recarregar } = useDados<{ motivos: string[]; sugerido?: string | null; paradas: Parada[] }>('/api/mes/paradas', ['parada', 'alarme', 'reiniciado']);
  const [escolhido, setMotivo] = useState<string | null>(null);
  const motivo = escolhido ?? dados?.sugerido ?? 'setup';
  const [observacao, setObservacao] = useState('');
  const acao = useAcao();
  const aberta = dados?.paradas.find((p) => p.fim === null);
  const agora = useAgora(aberta !== undefined);

  const abrir = () =>
    acao.executar('abrir', async () => {
      await api('/api/mes/paradas', { corpo: { motivo, observacao } });
      setObservacao('');
      setMotivo(null);
      await recarregar();
      return t.bancada.paradaApontada;
    });
  const encerrar = (id: number) =>
    acao.executar('encerrar', async () => {
      await api(`/api/mes/paradas/${id}/encerrar`, { corpo: {} });
      await recarregar();
      return t.bancada.paradaEncerrada;
    });

  return (
    <Cartao titulo={t.bancada.paradas}>
      {!dados ? (
        erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />
      ) : (
        <>
          {aberta ? (
            <div className="parada-aberta" role="status">
              <Icone nome="pausa" tamanho={22} />
              <div className="espaco">
                <strong>{t.motivoParada[aberta.motivo] ?? aberta.motivo}</strong>
                <div className="pequeno">
                  {t.bancada.paradaAberta} {fmtHora(aberta.inicio, idioma)}
                  {aberta.observacao ? ` · ${aberta.observacao}` : ''}
                </div>
              </div>
              <span className="tempo">{fmtDuracao(Math.max(0, agora - aberta.inicio))}</span>
              <Botao variante="primario" icone="tocar" ocupado={acao.ocupado === 'encerrar'} onClick={() => encerrar(aberta.id)}>
                {t.bancada.encerrarParada}
              </Botao>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void abrir();
              }}
            >
              <div className="campos">
                <Selecao rotulo={t.bancada.motivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} dica={dados.sugerido && motivo === dados.sugerido ? t.bancada.sugerido : undefined}>
                  {dados.motivos.map((m) => (
                    <option key={m} value={m}>
                      {t.motivoParada[m] ?? m}
                    </option>
                  ))}
                </Selecao>
                <Entrada rotulo={t.comum.observacao} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={200} />
              </div>
              <Botao type="submit" icone="pausa" ocupado={acao.ocupado === 'abrir'} style={{ marginBottom: '1rem' }}>
                {t.bancada.abrirParada}
              </Botao>
            </form>
          )}
          <MensagemErro erro={acao.erro} />
          {dados.paradas.length === 0 ? (
            <p className="suave">{t.bancada.semParadas}</p>
          ) : (
            <div className="tabela">
              <table>
                <thead>
                  <tr>
                    <th>{t.bancada.inicio}</th>
                    <th className="num">{t.bancada.duracao}</th>
                    <th>{t.bancada.motivo}</th>
                    <th>{t.comum.observacao}</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.paradas.map((p) => (
                    <tr key={p.id}>
                      <td className="num" style={{ textAlign: 'left' }}>{fmtHora(p.inicio, idioma)}</td>
                      <td className="num">{p.fim ? fmtDuracao(p.fim - p.inicio) : <Selo tom="atencao">{t.bancada.emAndamento}</Selo>}</td>
                      <td>{t.motivoParada[p.motivo] ?? p.motivo}</td>
                      <td className="suave">{p.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

function FalhasSimulador({ congelado, alarmado, produzindo }: { congelado: boolean; alarmado: boolean; produzindo: boolean }) {
  const { t } = useIdioma();
  const acao = useAcao();
  const falha = (f: 'congelar' | 'abortar' | 'alarme' | 'nenhuma') =>
    acao.executar(f, async () => {
      // o alarme simulado é o PSH-103 (código 2 da tabela ALARME do contrato do CLP)
      await api('/api/admin/simulador/falha', { corpo: f === 'alarme' ? { falha: f, alarme: 2 } : { falha: f } });
      return f === 'congelar' ? t.bancada.congelado : f === 'alarme' ? t.bancada.alarmado : f === 'nenhuma' ? t.bancada.normal : produzindo ? t.bancada.abortando : t.bancada.abortarArmado;
    });
  return (
    <Cartao titulo={t.bancada.simulador}>
      <p className="suave">{t.bancada.simuladorTexto}</p>
      {congelado && <Aviso tom="ruim">{t.bancada.congelado}</Aviso>}
      {alarmado && !congelado && <Aviso tom="ruim">{t.bancada.alarmado}</Aviso>}
      <MensagemErro erro={acao.erro} />
      <div className="falhas">
        <Botao icone="pausa" aria-pressed={congelado} ocupado={acao.ocupado === 'congelar'} disabled={congelado} onClick={() => falha('congelar')}>{t.bancada.falhaCongelar}</Botao>
        <Botao icone="raio" variante="perigo" ocupado={acao.ocupado === 'abortar'} disabled={congelado} onClick={() => falha('abortar')}>{t.bancada.falhaAbortar}</Botao>
        <Botao icone="alerta" aria-pressed={alarmado} ocupado={acao.ocupado === 'alarme'} disabled={congelado || alarmado} onClick={() => falha('alarme')}>{t.bancada.falhaAlarme}</Botao>
        <Botao icone="tocar" variante={congelado || alarmado ? 'primario' : undefined} ocupado={acao.ocupado === 'nenhuma'} onClick={() => falha('nenhuma')}>{t.bancada.falhaNenhuma}</Botao>
      </div>
    </Cartao>
  );
}

// ---------------- Qualidade ----------------

export function Qualidade() {
  const { t } = useIdioma();
  const [limite, setLimite] = useState(20);
  // uma a mais que o mostrado, para saber se há mais
  const { dados: lista, erro, recarregar } = useDados<Ordem[]>(`/api/mes/ordens?estado=aprovada,reprovada&limite=${limite + 1}`, ['ordem', 'reiniciado']);
  const antes = useRef<Ordem[] | null>(null);
  if (lista) antes.current = lista;
  const todas = lista ?? antes.current; // ao pedir mais, a lista de antes fica na tela até a nova chegar
  const dados = todas ? todas.slice(0, limite) : null;
  const aprovadas = (dados ?? []).filter((o) => o.situacao.estado === 'aprovada').length;
  return (
    <Pagina titulo={t.qualidade.titulo} subtitulo={t.qualidade.texto}>
      {dados && dados.length > 0 && (
        <div className="numeros">
          <Numero rotulo={t.indicadores.aprovadas} valor={String(aprovadas)} tom="ok" icone="certo" />
          <Numero rotulo={t.indicadores.reprovadas} valor={String(dados.length - aprovadas)} tom={dados.length - aprovadas > 0 ? 'ruim' : undefined} icone="fechar" />
        </div>
      )}
      <Cartao titulo={t.qualidade.recentes}>
        {!dados ? (
          erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />
        ) : dados.length === 0 ? (
          <Vazio icone="certo" titulo={t.qualidade.nenhuma} />
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>{t.comum.op}</th>
                  <th>{t.qualidade.grandeza}</th>
                  <th className="num">{t.comum.pedidoValor}</th>
                  <th className="num">{t.comum.medido}</th>
                  <th className="num">{t.comum.desvio}</th>
                  <th className="num">{t.comum.tolerancia}</th>
                  <th>{t.qualidade.resultado}</th>
                  <th><span className="so-leitor">{t.op.certificado}</span></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((o) => (
                  <LinhaQualidade key={o.numero} ordem={o} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {todas && todas.length > limite && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Botao onClick={() => setLimite(limite + 20)}>{t.comum.carregarMais}</Botao>
          </div>
        )}
      </Cartao>
    </Pagina>
  );
}

/** Uma batelada inspecionada: duas linhas (temperatura e volume), pedido × medido. */
function LinhaQualidade({ ordem: o }: { ordem: Ordem }) {
  const { t, idioma } = useIdioma();
  const loja = useOutroSistema();
  const { dados } = useDados<Dossie>(`/api/mes/ordens/${o.numero}`);
  const b = dados?.batelada;
  const a = dados?.avaliacao;
  const linha = (primeira: boolean, rotulo: string, unidade: string, pedido: number, medido: number | undefined, desvio: number | undefined, ok: boolean | undefined, tol: number) => (
    <tr>
      {primeira && (
        <td rowSpan={2}>
          <a href={`#/op/${o.numero}`}><strong>{t.comum.op} {o.numero}</strong></a>
        </td>
      )}
      <td>{rotulo}</td>
      <td className="num">{fmtNum(pedido, idioma)} {unidade}</td>
      <td className="num">{fmtNum(medido, idioma, 2)} {unidade}</td>
      <td className="num">
        {ok === undefined || desvio === undefined ? '—' : (
          <span className={`desvio ${ok ? 'ok' : 'ruim'}`}>
            <Icone nome={ok ? 'certo' : 'alerta'} tamanho={14} /> {desvio > 0 ? '+' : ''}{fmtNum(desvio, idioma, 2)}
          </span>
        )}
      </td>
      <td className="num">±{fmtNum(tol, idioma)}</td>
      {primeira && (
        <>
          <td rowSpan={2}>
            <SeloEstado estado={o.situacao.estado} />
          </td>
          <td rowSpan={2} className="acoes">
            {loja && (
              <a className="botao pequeno" href={`${loja}/#/certificado/${o.numero}`}>
                <Icone nome="documento" tamanho={15} /> {t.op.certificado}
              </a>
            )}
          </td>
        </>
      )}
    </tr>
  );
  return (
    <>
      {linha(true, t.comum.temperatura, t.unidades.celsius, o.receita.temperatura, b?.temperatura, a?.desvioTemperatura, a?.temperaturaOk, o.tolerancias.temperatura)}
      {linha(false, t.comum.volume, t.unidades.litros, o.receita.volume, b?.volume, a?.desvioVolume, a?.volumeOk, o.tolerancias.volume)}
    </>
  );
}

// ---------------- Indicadores ----------------

export function Indicadores() {
  const { t, idioma } = useIdioma();
  const { dados, erro, recarregar } = useDados<TipoIndicadores>('/api/mes/indicadores', ['ordem', 'parada', 'reiniciado'], 5000);
  if (!dados) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;
  const fator = (nome: string, texto: string, valor: number | null) => (
    <div className="fator">
      <span className="nome">{nome}</span>
      <span className="valor">{fmtPct(valor, idioma)}</span>
      <Progresso valor={valor ?? 0} max={1} rotulo={nome} />
      <span className="apoio">{texto}</span>
    </div>
  );
  return (
    <Pagina
      titulo={t.indicadores.titulo}
      subtitulo={`${t.indicadores.desde} ${fmtDataHora(dados.inicioAula, idioma)}${dados.escala > 1 ? ` · ${t.indicadores.escala} ${fmtNum(dados.escala, idioma, 0)}×` : ''}`}
      acoes={
        <a className="botao" href="/api/mes/relatorio.csv" download>
          <Icone nome="baixar" /> {t.indicadores.exportar}
        </a>
      }
    >
      <Cartao>
        <div className="oee">
          <Anel valor={dados.oee} rotulo={t.indicadores.oee} tamanho={210} />
          <div className="oee-fatores">
            {fator(t.indicadores.disponibilidade, t.indicadores.disponibilidadeTexto, dados.disponibilidade)}
            {fator(t.indicadores.desempenho, t.indicadores.desempenhoTexto, dados.desempenho)}
            {fator(t.indicadores.qualidade, t.indicadores.qualidadeTexto, dados.qualidade)}
          </div>
        </div>
        <p className="suave pequeno" style={{ marginTop: '1rem' }}>{t.indicadores.formula}</p>
      </Cartao>
      <div className="metades">
        <Cartao titulo={t.indicadores.producao}>
          <div className="numeros">
            <Numero rotulo={t.indicadores.produzidas} valor={String(dados.produzidas)} />
            <Numero rotulo={t.indicadores.aprovadas} valor={String(dados.aprovadas)} tom={dados.aprovadas > 0 ? 'ok' : undefined} />
            <Numero rotulo={t.indicadores.reprovadas} valor={String(dados.reprovadas)} tom={dados.reprovadas > 0 ? 'ruim' : undefined} />
            <Numero rotulo={t.indicadores.abortadas} valor={String(dados.abortadas)} tom={dados.abortadas > 0 ? 'atencao' : undefined} />
          </div>
        </Cartao>
        <Cartao titulo={t.indicadores.tempos}>
          <div className="numeros">
            <Numero rotulo={t.indicadores.cicloMedio} valor={fmtDuracao(dados.cicloMedioMs)} />
            <Numero rotulo={t.indicadores.leadTime} valor={fmtDuracao(dados.leadTimeMedioMs)} />
            <Numero rotulo={t.indicadores.noPrazo} valor={fmtPct(dados.noPrazo, idioma)} />
            <Numero rotulo={t.indicadores.tempoParado} valor={fmtDuracao(dados.tempoParadoMs)} />
          </div>
        </Cartao>
      </div>
    </Pagina>
  );
}

// ---------------- Detalhe da OP (rastreabilidade) ----------------

export function DetalheOp({ numero }: { numero: number }) {
  const { t, idioma } = useIdioma();
  const loja = useOutroSistema();
  const valido = Number.isInteger(numero) && numero > 0;
  const { dados, erro, recarregar } = useDados<Dossie>(valido ? `/api/mes/ordens/${numero}` : null, ['ordem', 'reiniciado']);
  const { bancada } = useBancada();
  const acao = useAcao();
  const emProducao = dados?.ordem.situacao.estado === 'em_producao';
  // o CLP responde e não está com esta OP: ela se perdeu no CLP
  const perdidaNoClp = emProducao && bancada?.conectado && bancada.clpVivo && bancada.opExecucao !== numero;
  useEffect(() => {
    if (!emProducao) return;
    const r = setInterval(recarregar, 3000);
    return () => clearInterval(r);
  }, [emProducao, recarregar]);

  const voltar = { href: '#/', rotulo: t.pcp.fila };
  if (!valido || (erro instanceof ErroApi && erro.status === 404)) {
    return (
      <Pagina titulo={t.op.titulo} voltar={voltar}>
        <Cartao>
          <Vazio icone="documento" titulo={t.op.naoEncontrada} />
        </Cartao>
      </Pagina>
    );
  }
  if (!dados) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;
  const { ordem: o, batelada: b, avaliacao: a } = dados;
  return (
    <Pagina
      titulo={`${t.op.titulo} ${o.numero}`}
      subtitulo={`${t.comum.origem}: ${origem(o, t)} · ${fmtDataHora(o.chegada, idioma)}`}
      voltar={voltar}
      acoes={<SeloEstado estado={o.situacao.estado} grande />}
    >
      {perdidaNoClp && (
        <Aviso tom="atencao">
          {t.op.registrarAbortadaTexto}
          <MensagemErro erro={acao.erro} />
          <div style={{ marginTop: '.6rem' }}>
            <Botao
              variante="perigo"
              ocupado={acao.ocupado === 'abortada'}
              onClick={() =>
                acao.executar('abortada', async () => {
                  await api(`/api/mes/ordens/${numero}/registrar-abortada`, { corpo: {} });
                  await recarregar();
                  return t.op.registradaAbortada;
                })
              }
            >
              {t.op.registrarAbortada}
            </Botao>
          </div>
        </Aviso>
      )}
      {o.recusa ? (
        <Aviso tom="ruim">
          <strong>{t.op.recusada}:</strong> {t.recusa[o.recusa] ?? o.recusa}.
        </Aviso>
      ) : null}
      <Cartao titulo={t.op.receita}>
        <div className="numeros">
          <Numero icone="gota" rotulo={t.comum.volume} valor={fmtNum(o.receita.volume, idioma)} unidade={t.unidades.litros} apoio={`±${fmtNum(o.tolerancias.volume, idioma)} ${t.unidades.litros}`} />
          <Numero icone="termometro" rotulo={t.comum.temperatura} valor={fmtNum(o.receita.temperatura, idioma, 0)} unidade={t.unidades.celsius} apoio={`±${fmtNum(o.tolerancias.temperatura, idioma)} ${t.unidades.celsius}`} />
          <Numero icone="vazao" rotulo={t.comum.vazao} valor={fmtNum(o.receita.vazao, idioma)} unidade={t.unidades.lmin} />
          <Numero icone="pressao" rotulo={t.comum.pressao} valor={fmtNum(o.receita.pressao, idioma)} unidade={t.unidades.bar} />
          <Numero icone="relogio" rotulo={t.comum.prazo} valor={fmtHora(o.prazo, idioma)} />
        </div>
      </Cartao>
      {b && (
        <Cartao
          titulo={t.op.batelada}
          extra={
            loja && (
              <a className="botao pequeno" href={`${loja}/#/certificado/${o.numero}`}>
                <Icone nome="documento" tamanho={15} /> {t.op.certificado}
              </a>
            )
          }
        >
          <div className="numeros">
            <Numero rotulo={`${t.comum.medido}: ${t.comum.volume}`} valor={fmtNum(b.volume, idioma, 2)} unidade={t.unidades.litros} tom={a ? (a.volumeOk ? 'ok' : 'ruim') : undefined}
              apoio={a ? `${t.comum.desvio} ${a.desvioVolume > 0 ? '+' : ''}${fmtNum(a.desvioVolume, idioma, 2)}` : undefined} />
            <Numero rotulo={`${t.comum.medido}: ${t.comum.temperatura}`} valor={fmtNum(b.temperatura, idioma, 2)} unidade={t.unidades.celsius} tom={a ? (a.temperaturaOk ? 'ok' : 'ruim') : undefined}
              apoio={a ? `${t.comum.desvio} ${a.desvioTemperatura > 0 ? '+' : ''}${fmtNum(a.desvioTemperatura, idioma, 2)}` : undefined} />
            <Numero rotulo={t.etapa[1]} valor={fmtDuracao(b.tempos.pressurizar)} />
            <Numero rotulo={t.etapa[2]} valor={fmtDuracao(b.tempos.aquecer)} />
            <Numero rotulo={t.etapa[6]} valor={fmtDuracao(b.tempos.resfriar)} />
            <Numero rotulo={t.etapa[3]} valor={fmtDuracao(b.tempos.transferir)} />
            <Numero rotulo={t.etapa[5]} valor={fmtDuracao(b.tempos.devolver)} />
          </div>
        </Cartao>
      )}
      <Cartao titulo={t.op.curva}>
        <Grafico
          series={[
            { nome: t.comum.temperatura, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: dados.leituras.map((l) => [l.horario, l.temperatura]), meta: { valor: o.receita.temperatura, rotulo: t.comum.meta } },
            { nome: t.comum.nivel, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: dados.leituras.map((l) => [l.horario, l.nivel]), meta: { valor: o.receita.volume, rotulo: t.comum.meta } },
          ]}
        />
      </Cartao>
      <Cartao titulo={t.op.eventos}>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>{t.comum.horario}</th>
                <th>{t.op.registro}</th>
                <th>{t.comum.detalhe}</th>
                <th>{t.comum.autor}</th>
              </tr>
            </thead>
            <tbody>
              {dados.eventos.map((e, i) => (
                <tr key={i}>
                  <td className="num" style={{ textAlign: 'left' }}>{fmtDataHora(e.horario, idioma)}</td>
                  <td><strong>{t.evento[e.tipo] ?? e.tipo}</strong></td>
                  <td className="suave">{detalheDoEvento(e, t)}</td>
                  <td className="suave">{e.autor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </Pagina>
  );
}
