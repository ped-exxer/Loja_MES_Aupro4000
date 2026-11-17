// Telas do MES: fila, bancada, qualidade (só leitura), indicadores, detalhe da OP.

import { useEffect, useState } from 'react';
import { FAIXAS, ORIGEM_LOJA } from '@aupro/dominio';
import { useIdioma } from '../i18n/index.ts';
import {
  COR_NIVEL, COR_TEMPERATURA, Carregando, Cartao, Grafico, MensagemErro, Numero, Selo, SeloEstado,
  api, fmtDataHora, fmtDuracao, fmtHora, fmtNum, fmtPct, useDados, useEvento, useOutroSistema,
} from '@aupro/interface';
import type { Bancada as TipoBancada, Dossie, Evento, Indicadores as TipoIndicadores, ItemFila, Ordem, Parada } from '@aupro/interface';

// OP da Loja: "Loja #<item>"; o certificado é uma página da Loja (link para o outro sistema)
const origem = (o: Ordem, manual: string, loja: string) =>
  o.origem === 'manual' || !o.origem ? manual : o.origem.replace(ORIGEM_LOJA, `${loja} #`);

// ---------------- Fila ----------------

export function Fila() {
  const { t, idioma } = useIdioma();
  const { dados, erro, recarregar } = useDados<ItemFila[]>('/api/mes/fila', ['ordem'], 5000);
  const [erroAcao, setErroAcao] = useState<unknown>(null);

  async function acao(caminho: string, corpo: unknown = {}) {
    setErroAcao(null);
    try {
      await api(caminho, { corpo });
      recarregar();
    } catch (e) {
      setErroAcao(e);
    }
  }

  return (
    <>
      <Cartao titulo={t.pcp.fila}>
        <p className="suave pequeno">{t.pcp.filaTexto}</p>
        <MensagemErro erro={erro ?? erroAcao} />
        {!dados ? (
          <Carregando />
        ) : dados.length === 0 ? (
          <p className="suave">{t.pcp.vazia}</p>
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
                  <th>{t.comum.acoes}</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((f) => {
                  const o = f.ordem;
                  const mexe = o.situacao.estado === 'na_fila' || o.situacao.estado === 'enviada';
                  const atrasada = f.fimEstimado > o.prazo;
                  return (
                    <tr key={o.numero} className={f.disponivel ? 'destaque' : ''}>
                      <td>{f.posicao}</td>
                      <td>
                        <a href={`#/op/${o.numero}`}>{o.numero}</a>
                      </td>
                      <td>{origem(o, t.comum.manual, t.sistema.loja)}</td>
                      <td className="num">{fmtNum(o.receita.temperatura, idioma, 0)} {t.unidades.celsius}</td>
                      <td className="num">{fmtNum(o.receita.volume, idioma)} {t.unidades.litros}</td>
                      <td className="num">{fmtNum(o.receita.vazao, idioma)}</td>
                      <td>
                        {fmtHora(o.prazo, idioma)} {atrasada && <Selo tom="atencao">!</Selo>}
                      </td>
                      <td>{fmtHora(f.inicioEstimado, idioma)}</td>
                      <td>{fmtHora(f.fimEstimado, idioma)}</td>
                      <td>
                        <SeloEstado estado={o.situacao.estado} />
                        {o.fixada !== null && mexe && <span className="suave pequeno"> · {t.pcp.fixada} {o.fixada}</span>}
                      </td>
                      <td>
                        {mexe && (
                          <div className="linha">
                            {o.fixada === null ? (
                              <button className="pequeno" onClick={() => acao(`/api/mes/ordens/${o.numero}/fixar`, { posicao: 1 })}>
                                {t.pcp.fixar}
                              </button>
                            ) : (
                              <button className="pequeno" onClick={() => acao(`/api/mes/ordens/${o.numero}/fixar`, { posicao: null })}>
                                {t.pcp.soltar}
                              </button>
                            )}
                            <button className="pequeno perigo" onClick={() => acao(`/api/mes/ordens/${o.numero}/cancelar`)}>
                              {t.comum.cancelar}
                            </button>
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
      <NovaOp aoCriar={recarregar} />
    </>
  );
}

function NovaOp({ aoCriar }: { aoCriar: () => void }) {
  const { t, idioma } = useIdioma();
  const [v, setV] = useState({ volume: 10, temperatura: 45, vazao: 4, pressao: 2, tolTemperatura: 2, tolVolume: 0.5 });
  const [erro, setErro] = useState<unknown>(null);
  const campo = (chave: keyof typeof v, rotulo: string, passo = 0.5) => {
    const faixa = chave in FAIXAS ? FAIXAS[chave as keyof typeof FAIXAS] : null;
    return (
      <label>
        <span>
          {rotulo}
          {faixa && ` (${fmtNum(faixa.min, idioma)}–${fmtNum(faixa.max, idioma)})`}
        </span>
        <input type="number" step={passo} value={v[chave]} onChange={(e) => setV({ ...v, [chave]: Number(e.target.value) })} />
      </label>
    );
  };
  return (
    <Cartao titulo={t.pcp.novaOp}>
      <div className="campos">
        {campo('volume', `${t.comum.volume} (${t.unidades.litros})`)}
        {campo('temperatura', `${t.comum.temperatura} (${t.unidades.celsius})`, 1)}
        {campo('vazao', `${t.comum.vazao} (${t.unidades.lmin})`)}
        {campo('pressao', `${t.comum.pressao} (${t.unidades.bar})`, 0.1)}
        {campo('tolTemperatura', t.pcp.tolTemperatura)}
        {campo('tolVolume', t.pcp.tolVolume, 0.1)}
      </div>
      <MensagemErro erro={erro} />
      <button
        className="primario"
        onClick={async () => {
          setErro(null);
          try {
            await api('/api/mes/ordens', { corpo: v });
            aoCriar();
          } catch (e) {
            setErro(e);
          }
        }}
      >
        {t.pcp.criar}
      </button>
    </Cartao>
  );
}

// ---------------- Bancada ----------------

export function Bancada() {
  const { t, idioma } = useIdioma();
  const inicial = useDados<TipoBancada>('/api/mes/bancada');
  const [b, setB] = useState<TipoBancada | null>(null);
  const [historico, setHistorico] = useState<{ x: number; temperatura: number; nivel: number }[]>([]);
  useEvento<TipoBancada>('bancada', (nova) => {
    setB(nova);
    const p = nova.processo;
    if (p) setHistorico((h) => [...h, { x: nova.atualizadoEm, temperatura: p.temperatura, nivel: p.nivel }].slice(-600));
  });
  const atual = b ?? inicial.dados;
  const eventos = useDados<Evento[]>('/api/mes/eventos', ['ordem', 'parada'], 10_000);

  if (!atual) return <Carregando />;
  const p = atual.processo;
  return (
    <>
      <Cartao titulo={t.bancada.titulo} extra={<span className="suave pequeno">{t.bancada.drivers[atual.driver ?? ''] ?? atual.driver}</span>}>
        <div className="linha">
          <Selo tom={atual.conectado ? 'ok' : 'ruim'}>{atual.conectado ? t.bancada.conectado : t.bancada.desconectado}</Selo>
          {atual.conectado && <Selo tom={atual.clpVivo ? 'ok' : 'ruim'}>{atual.clpVivo ? t.bancada.clpVivo : t.bancada.clpParado}</Selo>}
          {atual.erro && <span className="suave pequeno">{atual.erro}</span>}
        </div>
        {atual.comunicacaoPerdida && <div className="aviso aviso-ruim">{t.bancada.comunicacaoPerdida}</div>}
        <div className="numeros" style={{ marginTop: '.75rem' }}>
          <Numero texto rotulo={t.bancada.estadoClp} valor={atual.estadoClp === null ? '—' : (t.estadoClp[atual.estadoClp] ?? String(atual.estadoClp))} />
          <Numero texto rotulo={t.bancada.etapa} valor={atual.etapa === null ? '—' : (t.etapa[atual.etapa] ?? String(atual.etapa))} />
          <Numero texto rotulo={t.bancada.emProducao} valor={atual.opExecucao ? `${t.comum.op} ${atual.opExecucao}` : '—'} />
          <Numero texto rotulo={t.bancada.disponivel} valor={atual.disponivel ? `${t.comum.op} ${atual.disponivel}` : '—'} />
          <Numero texto rotulo={t.bancada.alarme} valor={atual.alarme ? String(atual.alarme) : '—'} />
        </div>
        <h3>{t.bancada.processo}</h3>
        {p ? (
          <>
            <div className="numeros">
              <Numero rotulo={`${t.comum.temperatura} TIT-104`} valor={fmtNum(p.temperatura, idioma)} unidade={t.unidades.celsius} />
              <Numero rotulo={`${t.comum.nivel} LIT-101`} valor={fmtNum(p.nivel, idioma)} unidade={t.unidades.litros} />
              <Numero rotulo={`${t.comum.pressao} PIT-103`} valor={fmtNum(p.pressao, idioma, 2)} unidade={t.unidades.bar} />
              <Numero rotulo={`${t.comum.vazao} FIT-102`} valor={fmtNum(p.vazao, idioma)} unidade={t.unidades.lmin} />
              <Numero rotulo={t.bancada.temperaturaTq02} valor={fmtNum(atual.temperaturaTq02, idioma)} unidade={t.unidades.celsius} />
              <Numero rotulo={t.bancada.temperaturaReservatorio} valor={fmtNum(atual.temperaturaReservatorio, idioma)} unidade={t.unidades.celsius} />
            </div>
            <Grafico
              series={[
                { nome: t.comum.temperatura, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: historico.map((h) => [h.x, h.temperatura]) },
                { nome: t.comum.nivel, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: historico.map((h) => [h.x, h.nivel]) },
              ]}
            />
          </>
        ) : (
          <p className="suave">{t.bancada.semProcesso}</p>
        )}
      </Cartao>

      <div className="colunas">
        <Paradas />
        <Cartao titulo={t.bancada.eventos}>
          <ul className="lista-eventos">
            {(eventos.dados ?? []).map((e, i) => (
              <li key={i}>
                <span className="suave">{fmtHora(e.horario, idioma)}</span> {e.numeroOp ? `${t.comum.op} ${e.numeroOp} · ` : ''}
                <strong>{e.tipo}</strong> {e.detalhe && <span className="suave">{e.detalhe}</span>} {e.autor && <span className="suave">· {e.autor}</span>}
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      {atual.driver === 'simulado' && <FalhasSimulador />}
    </>
  );
}

function Paradas() {
  const { t, idioma } = useIdioma();
  const { dados, recarregar } = useDados<{ motivos: string[]; paradas: Parada[] }>('/api/mes/paradas', ['parada', 'reiniciado']);
  const [motivo, setMotivo] = useState('setup');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  const aberta = dados?.paradas.find((p) => p.fim === null);

  async function acao(caminho: string, corpo: unknown = {}) {
    setErro(null);
    try {
      await api(caminho, { corpo });
      setObservacao('');
      recarregar();
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <Cartao titulo={t.bancada.paradas}>
      <MensagemErro erro={erro} />
      {aberta ? (
        <div className="aviso aviso-atencao">
          {t.bancada.paradaAberta} {fmtHora(aberta.inicio, idioma)} · {t.motivoParada[aberta.motivo] ?? aberta.motivo}
          <div style={{ marginTop: '.5rem' }}>
            <button className="primario" onClick={() => acao(`/api/mes/paradas/${aberta.id}/encerrar`)}>
              {t.bancada.encerrarParada}
            </button>
          </div>
        </div>
      ) : (
        <div className="campos">
          <label>
            <span>{t.bancada.motivo}</span>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {(dados?.motivos ?? []).map((m) => (
                <option key={m} value={m}>
                  {t.motivoParada[m] ?? m}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.comum.observacao}</span>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <div>
            <button onClick={() => acao('/api/mes/paradas', { motivo, observacao })}>{t.bancada.abrirParada}</button>
          </div>
        </div>
      )}
      {dados && dados.paradas.length === 0 ? (
        <p className="suave">{t.bancada.semParadas}</p>
      ) : (
        <table>
          <tbody>
            {(dados?.paradas ?? []).map((p) => (
              <tr key={p.id}>
                <td>{fmtHora(p.inicio, idioma)}</td>
                <td>{p.fim ? fmtDuracao(p.fim - p.inicio) : '…'}</td>
                <td>{t.motivoParada[p.motivo] ?? p.motivo}</td>
                <td className="suave">{p.observacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}

function FalhasSimulador() {
  const { t } = useIdioma();
  const [erro, setErro] = useState<unknown>(null);
  const falha = async (f: string) => {
    setErro(null);
    try {
      await api('/api/admin/simulador/falha', { corpo: { falha: f } });
    } catch (e) {
      setErro(e);
    }
  };
  return (
    <Cartao titulo={t.bancada.simulador}>
      <p className="suave pequeno">{t.bancada.simuladorTexto}</p>
      <MensagemErro erro={erro} />
      <div className="linha">
        <button onClick={() => falha('congelar')}>{t.bancada.falhaCongelar}</button>
        <button onClick={() => falha('abortar')}>{t.bancada.falhaAbortar}</button>
        <button onClick={() => falha('nenhuma')}>{t.bancada.falhaNenhuma}</button>
      </div>
    </Cartao>
  );
}

// ---------------- Qualidade ----------------

export function Qualidade() {
  const { t, idioma } = useIdioma();
  const { dados, erro } = useDados<Ordem[]>('/api/mes/ordens?estado=aprovada,reprovada', ['ordem', 'reiniciado']);
  return (
    <Cartao titulo={t.qualidade.titulo}>
      <p className="suave pequeno">{t.qualidade.texto}</p>
      <MensagemErro erro={erro} />
      {!dados ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <p className="suave">{t.qualidade.nenhuma}</p>
      ) : (
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>{t.comum.op}</th>
                <th />
                <th className="num">{t.comum.pedidoValor}</th>
                <th className="num">{t.comum.medido}</th>
                <th className="num">{t.comum.desvio}</th>
                <th className="num">{t.comum.tolerancia}</th>
                <th>{t.qualidade.resultado}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dados.slice(0, 20).map((o) => (
                <LinhaQualidade key={o.numero} ordem={o} idioma={idioma} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

/** Uma batelada inspecionada: duas linhas (temperatura e volume), pedido × medido. */
function LinhaQualidade({ ordem: o, idioma }: { ordem: Ordem; idioma: ReturnType<typeof useIdioma>['idioma'] }) {
  const { t } = useIdioma();
  const loja = useOutroSistema();
  const { dados } = useDados<Dossie>(`/api/mes/ordens/${o.numero}`);
  const b = dados?.batelada;
  const a = dados?.avaliacao;
  const linha = (primeira: boolean, rotulo: string, pedido: number, medido: number | undefined, desvio: number | undefined, ok: boolean | undefined, tol: number) => (
    <tr>
      {primeira && (
        <td rowSpan={2}>
          <a href={`#/op/${o.numero}`}>{o.numero}</a>
        </td>
      )}
      <td>{rotulo}</td>
      <td className="num">{fmtNum(pedido, idioma)}</td>
      <td className="num">{fmtNum(medido, idioma, 2)}</td>
      <td className="num">{ok === undefined ? '—' : <Selo tom={ok ? 'ok' : 'ruim'}>{fmtNum(desvio, idioma, 2)}</Selo>}</td>
      <td className="num">±{fmtNum(tol, idioma)}</td>
      {primeira && (
        <>
          <td rowSpan={2}>
            <SeloEstado estado={o.situacao.estado} />
          </td>
          <td rowSpan={2}>
            {loja && <a href={`${loja}/#/certificado/${o.numero}`}>{t.op.certificado}</a>}
          </td>
        </>
      )}
    </tr>
  );
  return (
    <>
      {linha(true, t.comum.temperatura, o.receita.temperatura, b?.temperatura, a?.desvioTemperatura, a?.temperaturaOk, o.tolerancias.temperatura)}
      {linha(false, t.comum.volume, o.receita.volume, b?.volume, a?.desvioVolume, a?.volumeOk, o.tolerancias.volume)}
    </>
  );
}

// ---------------- Indicadores ----------------

export function Indicadores() {
  const { t, idioma } = useIdioma();
  const { dados, erro } = useDados<TipoIndicadores>('/api/mes/indicadores', ['ordem', 'parada', 'reiniciado'], 5000);
  if (erro) return <MensagemErro erro={erro} />;
  if (!dados) return <Carregando />;
  return (
    <Cartao
      titulo={t.indicadores.titulo}
      extra={
        <a className="botao" href="/api/mes/relatorio.csv" download>
          {t.indicadores.exportar}
        </a>
      }
    >
      <p className="suave pequeno">
        {t.indicadores.desde} {fmtDataHora(dados.inicioAula, idioma)}
        {dados.escala > 1 && ` · ${t.indicadores.escala} ${dados.escala}×`}
      </p>
      <div className="numeros">
        <div className="numero grande">
          <div className="numero-rotulo">{t.indicadores.oee}</div>
          <div className="numero-valor">{fmtPct(dados.oee, idioma)}</div>
        </div>
        <Numero rotulo={t.indicadores.disponibilidade} valor={fmtPct(dados.disponibilidade, idioma)} />
        <Numero rotulo={t.indicadores.desempenho} valor={fmtPct(dados.desempenho, idioma)} />
        <Numero rotulo={t.indicadores.qualidade} valor={fmtPct(dados.qualidade, idioma)} />
      </div>
      <p className="suave pequeno">{t.indicadores.formula}</p>
      <div className="numeros">
        <Numero rotulo={t.indicadores.produzidas} valor={String(dados.produzidas)} />
        <Numero rotulo={t.indicadores.aprovadas} valor={String(dados.aprovadas)} />
        <Numero rotulo={t.indicadores.reprovadas} valor={String(dados.reprovadas)} />
        <Numero rotulo={t.indicadores.abortadas} valor={String(dados.abortadas)} />
        <Numero rotulo={t.indicadores.cicloMedio} valor={fmtDuracao(dados.cicloMedioMs)} />
        <Numero rotulo={t.indicadores.leadTime} valor={fmtDuracao(dados.leadTimeMedioMs)} />
        <Numero rotulo={t.indicadores.noPrazo} valor={fmtPct(dados.noPrazo, idioma)} />
        <Numero rotulo={t.indicadores.tempoParado} valor={fmtDuracao(dados.tempoParadoMs)} />
      </div>
    </Cartao>
  );
}

// ---------------- Detalhe da OP (rastreabilidade) ----------------

export function DetalheOp({ numero }: { numero: number }) {
  const { t, idioma } = useIdioma();
  const loja = useOutroSistema();
  const { dados, erro, recarregar } = useDados<Dossie>(`/api/mes/ordens/${numero}`, ['ordem']);
  const bancada = useDados<TipoBancada>('/api/mes/bancada', [], 3000);
  const [erroAcao, setErroAcao] = useState<unknown>(null);
  const emProducao = dados?.ordem.situacao.estado === 'em_producao';
  // o CLP responde e não está com esta OP: ela se perdeu no CLP
  const perdidaNoClp = emProducao && bancada.dados?.clpVivo && bancada.dados.opExecucao !== numero;
  useEffect(() => {
    if (!emProducao) return;
    const r = setInterval(recarregar, 3000);
    return () => clearInterval(r);
  }, [emProducao, recarregar]);

  if (erro) return <MensagemErro erro={erro} />;
  if (!dados) return <Carregando />;
  const { ordem: o, batelada: b } = dados;
  return (
    <>
      <p>
        <a href="#/fila" onClick={(e) => { e.preventDefault(); history.back(); }}>← {t.comum.voltar}</a>
      </p>
      <Cartao titulo={`${t.op.titulo} ${o.numero}`} extra={<SeloEstado estado={o.situacao.estado} />}>
        {perdidaNoClp && (
          <div className="aviso aviso-atencao">
            {t.op.registrarAbortadaTexto}
            <MensagemErro erro={erroAcao} />
            <div style={{ marginTop: '.5rem' }}>
              <button
                className="perigo"
                onClick={async () => {
                  setErroAcao(null);
                  try {
                    await api(`/api/mes/ordens/${numero}/registrar-abortada`, { corpo: {} });
                    recarregar();
                  } catch (e) {
                    setErroAcao(e);
                  }
                }}
              >
                {t.op.registrarAbortada}
              </button>
            </div>
          </div>
        )}
        <div className="numeros">
          <Numero rotulo={t.comum.volume} valor={fmtNum(o.receita.volume, idioma)} unidade={t.unidades.litros} />
          <Numero rotulo={t.comum.temperatura} valor={fmtNum(o.receita.temperatura, idioma, 0)} unidade={t.unidades.celsius} />
          <Numero rotulo={t.comum.vazao} valor={fmtNum(o.receita.vazao, idioma)} unidade={t.unidades.lmin} />
          <Numero rotulo={t.comum.pressao} valor={fmtNum(o.receita.pressao, idioma)} unidade={t.unidades.bar} />
          <Numero rotulo={t.comum.prazo} valor={fmtHora(o.prazo, idioma)} />
          <Numero texto rotulo={t.comum.origem} valor={origem(o, t.comum.manual, t.sistema.loja)} />
        </div>
        {b && (
          <>
            <h3>{t.op.batelada}</h3>
            <div className="numeros">
              <Numero rotulo={`${t.comum.medido}: ${t.comum.volume}`} valor={fmtNum(b.volume, idioma, 2)} unidade={t.unidades.litros} />
              <Numero rotulo={`${t.comum.medido}: ${t.comum.temperatura}`} valor={fmtNum(b.temperatura, idioma, 2)} unidade={t.unidades.celsius} />
              <Numero rotulo={t.etapa[2]} valor={fmtDuracao(b.tempos.aquecer)} />
              <Numero rotulo={t.etapa[6]} valor={fmtDuracao(b.tempos.resfriar)} />
              <Numero rotulo={t.etapa[3]} valor={fmtDuracao(b.tempos.transferir)} />
            </div>
            <p>
              {loja && <a href={`${loja}/#/certificado/${o.numero}`}>{t.op.certificado}</a>}
            </p>
          </>
        )}
        <Grafico
          series={[
            { nome: t.comum.temperatura, cor: COR_TEMPERATURA, unidade: t.unidades.celsius, pontos: dados.leituras.map((l) => [l.horario, l.temperatura]) },
            { nome: t.comum.nivel, cor: COR_NIVEL, unidade: t.unidades.litros, pontos: dados.leituras.map((l) => [l.horario, l.nivel]) },
          ]}
        />
      </Cartao>
      <Cartao titulo={t.op.eventos}>
        <table>
          <thead>
            <tr>
              <th>{t.comum.horario}</th>
              <th>{t.comum.estado}</th>
              <th>{t.comum.detalhe}</th>
              <th>{t.comum.autor}</th>
            </tr>
          </thead>
          <tbody>
            {dados.eventos.map((e, i) => (
              <tr key={i}>
                <td>{fmtDataHora(e.horario, idioma)}</td>
                <td>{e.tipo}</td>
                <td className="suave">{e.detalhe}</td>
                <td className="suave">{e.autor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>
    </>
  );
}
