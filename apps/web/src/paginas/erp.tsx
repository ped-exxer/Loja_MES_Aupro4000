// Telas do ERP: pedidos de venda, faturas, catálogo.

import { useState } from 'react';
import { useIdioma } from '../i18n/index.ts';
import { api, fmtDataHora, fmtHora, fmtMoeda, fmtNum, useDados } from '../infra.ts';
import { Carregando, Cartao, MensagemErro, SeloEstado } from '../componentes.tsx';
import type { Fatura, Pedido, Produto } from '../tipos.ts';

export function Vendas() {
  const { t, idioma } = useIdioma();
  const pedidos = useDados<Pedido[]>('/api/erp/pedidos', ['pedido', 'ordem', 'reiniciado']);
  const faturas = useDados<Fatura[]>('/api/erp/faturas', ['pedido', 'ordem', 'reiniciado']);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function acao(caminho: string) {
    setErro(null);
    setAviso(null);
    try {
      const r = await api<{ resultado?: string }>(caminho, { corpo: {} });
      if (r.resultado === 'pendente') setAviso(t.vendas.cancelamentoPendente);
      pedidos.recarregar();
    } catch (e) {
      setErro(e);
    }
  }

  const total = (faturas.dados ?? []).reduce((s, f) => s + f.valor, 0);
  return (
    <>
      <Cartao titulo={t.vendas.pedidos}>
        <MensagemErro erro={erro} />
        {aviso && <div className="aviso aviso-info">{aviso}</div>}
        {!pedidos.dados ? (
          <Carregando />
        ) : pedidos.dados.length === 0 ? (
          <p className="suave">{t.vendas.semPedidos}</p>
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>{t.comum.pedido}</th>
                  <th>{t.comum.cliente}</th>
                  <th>{t.comum.produto}</th>
                  <th>{t.comum.op}</th>
                  <th>{t.comum.prazo}</th>
                  <th>{t.comum.estado}</th>
                  <th className="num">{t.comum.preco}</th>
                  <th>{t.comum.acoes}</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.dados.flatMap((p) =>
                  p.itens.map((i, j) => {
                    const estado = i.producao?.estado;
                    return (
                      <tr key={i.id}>
                        <td>
                          {j === 0 && (
                            <>
                              <a href={`#/pedido/${p.id}`}>{p.id}</a>
                              <div className="suave pequeno">{fmtDataHora(p.criadoEm, idioma)}</div>
                            </>
                          )}
                        </td>
                        <td>
                          {j === 0 && (
                            <>
                              {p.cliente.nome}
                              <div className="suave pequeno">
                                {p.cliente.email}
                                {p.cliente.turma && ` · ${p.cliente.turma}`}
                              </div>
                            </>
                          )}
                        </td>
                        <td>
                          {i.nomeProduto}
                          <div className="suave pequeno">
                            {fmtNum(i.receita.volume, idioma)} {t.unidades.litros} · {fmtNum(i.receita.temperatura, idioma, 0)} {t.unidades.celsius}
                          </div>
                        </td>
                        <td>{i.numeroOp && <a href={`#/retaguarda/op/${i.numeroOp}`}>{i.numeroOp}</a>}</td>
                        <td>{fmtHora(i.prazo, idioma)}</td>
                        <td>{estado && <SeloEstado estado={estado} />}</td>
                        <td className="num">{fmtMoeda(i.preco, idioma)}</td>
                        <td>
                          {(estado === 'na_fila' || estado === 'enviada') && (
                            <button className="pequeno perigo" onClick={() => acao(`/api/erp/itens/${i.id}/cancelar`)}>
                              {t.vendas.cancelarItem}
                            </button>
                          )}
                          {(estado === 'reprovada' || estado === 'recusada' || estado === 'abortada') && (
                            <button className="pequeno" onClick={() => acao(`/api/erp/itens/${i.id}/refazer`)}>
                              {t.vendas.refazer}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      <Cartao titulo={t.vendas.faturas} extra={<strong>{fmtMoeda(total, idioma)}</strong>}>
        {(faturas.dados ?? []).length === 0 ? (
          <p className="suave">{t.vendas.semFaturas}</p>
        ) : (
          <table>
            <tbody>
              {faturas.dados!.map((f) => (
                <tr key={f.id}>
                  <td>#{f.id}</td>
                  <td>{fmtDataHora(f.emitidaEm, idioma)}</td>
                  <td>{f.cliente.nome}</td>
                  <td>
                    {f.produto} · {t.comum.op} {f.numeroOp}
                  </td>
                  <td className="num">{fmtMoeda(f.valor, idioma)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}

type FormProduto = {
  nome: string;
  descricao: string;
  preco: number;
  volume: number;
  temperatura: number;
  vazao: number;
  pressao: number;
  tolTemperatura: number;
  tolVolume: number;
  sobMedida: boolean;
  ativo: boolean;
};

const formDe = (p: Produto): FormProduto => ({
  nome: p.nome,
  descricao: p.descricao ?? '',
  preco: p.preco,
  ...p.receita,
  tolTemperatura: p.tolerancias.temperatura,
  tolVolume: p.tolerancias.volume,
  sobMedida: p.sobMedida,
  ativo: p.ativo,
});

const NOVO: FormProduto = {
  nome: '', descricao: '', preco: 10, volume: 10, temperatura: 45, vazao: 4, pressao: 2, tolTemperatura: 2, tolVolume: 0.5, sobMedida: false, ativo: true,
};

export function Catalogo() {
  const { t, idioma } = useIdioma();
  const { dados, recarregar } = useDados<Produto[]>('/api/erp/produtos');
  const [editando, setEditando] = useState<{ id: number | null; form: FormProduto } | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  async function salvar() {
    if (!editando) return;
    setErro(null);
    try {
      if (editando.id === null) await api('/api/erp/produtos', { corpo: editando.form });
      else await api(`/api/erp/produtos/${editando.id}`, { metodo: 'PUT', corpo: editando.form });
      setEditando(null);
      recarregar();
    } catch (e) {
      setErro(e);
    }
  }

  const campo = (chave: keyof FormProduto, rotulo: string, tipo: 'texto' | 'numero' = 'numero') =>
    editando && (
      <label>
        <span>{rotulo}</span>
        <input
          type={tipo === 'numero' ? 'number' : 'text'}
          step="0.1"
          value={String(editando.form[chave])}
          onChange={(e) =>
            setEditando({ ...editando, form: { ...editando.form, [chave]: tipo === 'numero' ? Number(e.target.value) : e.target.value } })
          }
        />
      </label>
    );

  return (
    <Cartao titulo={t.catalogo.titulo} extra={<button onClick={() => setEditando({ id: null, form: NOVO })}>{t.catalogo.novo}</button>}>
      {editando && (
        <div className="cartao">
          <div className="campos">
            {campo('nome', t.comum.produto, 'texto')}
            {campo('descricao', t.catalogo.descricao, 'texto')}
            {campo('preco', t.comum.preco)}
            {campo('volume', `${t.comum.volume} (${t.unidades.litros})`)}
            {campo('temperatura', `${t.comum.temperatura} (${t.unidades.celsius})`)}
            {campo('vazao', `${t.comum.vazao} (${t.unidades.lmin})`)}
            {campo('pressao', `${t.comum.pressao} (${t.unidades.bar})`)}
            {campo('tolTemperatura', `${t.comum.tolerancia} ±${t.unidades.celsius}`)}
            {campo('tolVolume', `${t.comum.tolerancia} ±${t.unidades.litros}`)}
          </div>
          <label className="marcar">
            <input type="checkbox" checked={editando.form.sobMedida} onChange={(e) => setEditando({ ...editando, form: { ...editando.form, sobMedida: e.target.checked } })} />
            <span>{t.catalogo.sobMedida}</span>
          </label>
          <label className="marcar">
            <input type="checkbox" checked={editando.form.ativo} onChange={(e) => setEditando({ ...editando, form: { ...editando.form, ativo: e.target.checked } })} />
            <span>{t.catalogo.ativo}</span>
          </label>
          <MensagemErro erro={erro} />
          <div className="linha">
            <button className="primario" onClick={salvar}>{t.comum.salvar}</button>
            <button onClick={() => setEditando(null)}>{t.comum.cancelar}</button>
          </div>
        </div>
      )}
      {!dados ? (
        <Carregando />
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t.comum.produto}</th>
              <th className="num">{t.comum.volume}</th>
              <th className="num">{t.comum.temperatura}</th>
              <th className="num">{t.comum.vazao}</th>
              <th className="num">{t.comum.preco}</th>
              <th>{t.catalogo.ativo}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dados.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nome}
                  {p.sobMedida && <span className="suave pequeno"> · {t.catalogo.sobMedida}</span>}
                </td>
                <td className="num">{fmtNum(p.receita.volume, idioma)}</td>
                <td className="num">{fmtNum(p.receita.temperatura, idioma, 0)} ±{fmtNum(p.tolerancias.temperatura, idioma)}</td>
                <td className="num">{fmtNum(p.receita.vazao, idioma)}</td>
                <td className="num">{fmtMoeda(p.preco, idioma)}</td>
                <td>{p.ativo ? t.comum.sim : t.comum.nao}</td>
                <td>
                  <button className="pequeno" onClick={() => setEditando({ id: p.id, form: formDe(p) })}>
                    {t.catalogo.editar}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
