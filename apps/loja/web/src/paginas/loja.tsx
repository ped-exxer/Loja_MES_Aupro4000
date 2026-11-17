// Vitrine: catálogo, carrinho, pedido, acompanhamento ao vivo, certificado.

import { useEffect, useState } from 'react';
import { validarReceita, type Receita } from '@aupro/dominio';
import { useIdioma } from '../i18n/index.ts';
import {
  Aviso, Botao, COR_NIVEL, COR_TEMPERATURA, Carregando, Cartao, Entrada, ErroApi, FalhaAoCarregar, Grafico, Icone, MensagemErro,
  Numero, Pagina, Progresso, Selo, SeloEstado, Vazio,
  erroDoCampo, fmtDataHora, fmtDuracao, fmtHora, fmtMoeda, fmtNum, numeroDe, tomDoEstado, useAcao, useAvisos, useDados, api,
} from '@aupro/interface';
import type { Catalogo, Certificado as TipoCertificado, EstadoOp, ItemPedido, Pedido, Produto } from '@aupro/interface';

// ---------------- carrinho ----------------

/** O que o cliente escolheu: no sob medida, o volume e a temperatura dele; nos outros, só o produto. */
type LinhaSalva = { produtoId: number; volume: number; temperatura: number; quantidade: number };
type LinhaCarrinho = LinhaSalva & { produto: Produto };

const CHAVE_CARRINHO = 'carrinho';

function carrinhoSalvo(): LinhaSalva[] {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_CARRINHO) ?? '[]') as LinhaSalva[];
    return Array.isArray(salvo) ? salvo.filter((l) => Number.isInteger(l?.produtoId) && Number.isInteger(l?.quantidade) && l.quantidade > 0) : [];
  } catch {
    return [];
  }
}

/** O carrinho fica guardado enquanto a aba estiver aberta: passear pelos Pedidos e voltar não o esvazia. */
function useCarrinho() {
  const [linhas, setLinhas] = useState<LinhaSalva[]>(carrinhoSalvo);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_CARRINHO, JSON.stringify(linhas));
    } catch {
      // sem armazenamento: o carrinho vale só nesta tela
    }
  }, [linhas]);
  const igual = (a: LinhaSalva, b: Omit<LinhaSalva, 'quantidade'>) => a.produtoId === b.produtoId && a.volume === b.volume && a.temperatura === b.temperatura;
  return {
    linhas,
    adicionar: (nova: Omit<LinhaSalva, 'quantidade'>) =>
      setLinhas((c) => (c.some((l) => igual(l, nova)) ? c.map((l) => (igual(l, nova) ? { ...l, quantidade: l.quantidade + 1 } : l)) : [...c, { ...nova, quantidade: 1 }])),
    mudar: (i: number, quantidade: number) => setLinhas((c) => c.flatMap((l, j) => (j !== i ? [l] : quantidade > 0 ? [{ ...l, quantidade }] : []))),
    esvaziar: () => setLinhas([]),
  };
}

// ---------------- vitrine ----------------

export function Vitrine({ navegar }: { navegar: (rota: string) => void }) {
  const { t, idioma } = useIdioma();
  const { avisar } = useAvisos();
  const { dados, erro, recarregar } = useDados<Catalogo>('/api/loja/catalogo', ['producao', 'reiniciado'], 15_000);
  const carrinho = useCarrinho();
  const [nome, setNome] = useState('');
  const [faltaNome, setFaltaNome] = useState(false);
  const [aberto, setAberto] = useState(false); // a gaveta do carrinho, no celular
  const pedido = useAcao();

  // Esc fecha a gaveta do carrinho; o foco entra nela ao abrir (o botão que a abriu some) e volta ao botão ao fechar
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    addEventListener('keydown', aoTeclar);
    document.querySelector<HTMLElement>('.carrinho-fechar')?.focus();
    return () => {
      removeEventListener('keydown', aoTeclar);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.carrinho-barra')?.focus());
    };
  }, [aberto]);

  if (!dados) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;

  // produto que saiu do catálogo sai do carrinho
  // (`indice` = a posição no carrinho guardado, que ainda tem as linhas escondidas: é ela que os botões mudam)
  const linhas = carrinho.linhas.flatMap((l, indice): (LinhaCarrinho & { indice: number })[] => {
    const produto = dados.produtos.find((p) => p.id === l.produtoId);
    return produto ? [{ ...l, produto, indice }] : [];
  });
  const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0);

  async function confirmar() {
    if (!nome.trim()) {
      setFaltaNome(true);
      return;
    }
    await pedido.executar('confirmar', async () => {
      const r = await api<{ pedidoId: number }>('/api/loja/pedidos', {
        corpo: {
          cliente: { nome },
          itens: linhas.map((l) => ({
            produtoId: l.produtoId,
            quantidade: l.quantidade,
            // sob medida: só volume e temperatura; vazão e pressão vêm do produto
            receita: l.produto.sobMedida ? { volume: l.volume, temperatura: l.temperatura } : undefined,
          })),
        },
      });
      carrinho.esvaziar();
      navegar(`/pedido/${r.pedidoId}`);
    });
  }

  return (
    <>
      <header className="vitrine-capa">
        <h1>{t.vitrine.titulo}</h1>
        <p>{t.vitrine.subtitulo}</p>
      </header>
      {!dados.mesNoAr && <Aviso tom="atencao">{t.vitrine.mesForaDoAr}</Aviso>}
      <div className="vitrine">
        <section aria-label={t.vitrine.produtos}>
          {dados.produtos.length === 0 ? (
            <Cartao>
              <Vazio titulo={t.vitrine.semProdutos} />
            </Cartao>
          ) : (
            <div className="produtos">
              {dados.produtos.map((p) => (
                <CartaoProduto
                  key={p.id}
                  produto={p}
                  faixas={dados.faixas}
                  adicionar={(volume, temperatura) => {
                    carrinho.adicionar({ produtoId: p.id, volume, temperatura });
                    avisar('ok', `${p.nome} ${t.vitrine.adicionado}`);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <button type="button" className="carrinho-fundo" hidden={!aberto} onClick={() => setAberto(false)} aria-label={t.comum.fechar} tabIndex={-1} />
        <aside className={`cartao carrinho${aberto ? ' aberto' : ''}`} aria-label={t.vitrine.carrinho}>
          <div className="carrinho-topo">
            <h2>
              <Icone nome="carrinho" tamanho={20} /> {t.vitrine.carrinho} {unidades > 0 && <span className="contador">{unidades}</span>}
            </h2>
            <Botao variante="sutil" icone="fechar" rotulo={t.comum.fechar} className="carrinho-fechar" onClick={() => setAberto(false)} />
          </div>
          {linhas.length === 0 ? (
            <Vazio icone="carrinho" titulo={t.vitrine.carrinhoVazio} />
          ) : (
            <>
              <ul className="carrinho-itens">
                {linhas.map((l) => (
                  <li key={`${l.produtoId}-${l.volume}-${l.temperatura}`}>
                    <div>
                      <div className="nome">{l.produto.nome}</div>
                      <div className="suave pequeno">
                        {fmtNum(l.volume, idioma)} {t.unidades.litros} · {fmtNum(l.temperatura, idioma, 0)} {t.unidades.celsius}
                      </div>
                    </div>
                    <div className="valor">{fmtMoeda(l.produto.preco * l.quantidade, idioma)}</div>
                    <div className="quantidade" role="group" aria-label={`${t.vitrine.quantidade}: ${l.produto.nome}`}>
                      <button type="button" onClick={() => carrinho.mudar(l.indice, l.quantidade - 1)} disabled={l.quantidade <= 1} aria-label={t.vitrine.menos}>
                        <Icone nome="menos" tamanho={15} />
                      </button>
                      <output>{l.quantidade}</output>
                      <button type="button" onClick={() => carrinho.mudar(l.indice, l.quantidade + 1)} aria-label={t.vitrine.mais}>
                        <Icone nome="mais" tamanho={15} />
                      </button>
                    </div>
                    <div className="direita">
                      <Botao pequeno variante="sutil" icone="lixo" onClick={() => carrinho.mudar(l.indice, 0)} aria-label={`${t.vitrine.remover}: ${l.produto.nome}`}>
                        {t.vitrine.remover}
                      </Botao>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="carrinho-total">
                <span>
                  {t.comum.total} · {unidades} {unidades === 1 ? t.vitrine.unidade : t.vitrine.unidades}
                </span>
                <strong>{fmtMoeda(total, idioma)}</strong>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirmar();
                }}
                noValidate
              >
                <Entrada
                  rotulo={t.vitrine.nome}
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setFaltaNome(false);
                  }}
                  autoComplete="name"
                  maxLength={80}
                  dica={t.vitrine.nomeDica}
                  erro={faltaNome ? t.vitrine.nomeFalta : erroDoCampo(pedido.erro, 'cliente.nome', t)}
                />
                <MensagemErro erro={pedido.erro} campos={['cliente.nome']} />
                <Botao type="submit" variante="primario" className="largo" ocupado={pedido.ocupado === 'confirmar'} icone="certo">
                  {t.vitrine.confirmar}
                </Botao>
              </form>
              <p className="suave pequeno" style={{ marginTop: '.75rem' }}>{t.vitrine.semPagamento}</p>
            </>
          )}
        </aside>
        {unidades > 0 && !aberto && (
          <button type="button" className="carrinho-barra" onClick={() => setAberto(true)}>
            <Icone nome="carrinho" tamanho={20} />
            <span className="contador">{unidades}</span>
            <span className="espaco">{t.vitrine.verCarrinho}</span>
            <span className="num">{fmtMoeda(total, idioma)}</span>
          </button>
        )}
      </div>
    </>
  );
}

/** Ilustração do produto: o tanque com o nível proporcional ao volume e o termômetro (e o vapor) conforme a temperatura. */
function Ilustracao({ volume, temperatura, faixas }: { volume: number; temperatura: number; faixas: Catalogo['faixas'] }) {
  const entre = (v: number, f: { min: number; max: number }) => (Number.isFinite(v) ? Math.min(1, Math.max(0, (v - f.min) / (f.max - f.min))) : 0.5);
  const quente = entre(temperatura, faixas.temperatura);
  const cheio = Number.isFinite(volume) ? Math.min(1, Math.max(0.08, volume / faixas.volume.max)) : 0.5;
  const calor = '#f2681d';
  // o fundo vai do azul claro (morna) ao laranja claro (quente), passando por um amarelo claro
  const fundo = quente < 0.5
    ? `color-mix(in srgb, #fff3cf ${Math.round(quente * 200)}%, #d9edff)`
    : `color-mix(in srgb, #ffd8bf ${Math.round((quente - 0.5) * 200)}%, #fff3cf)`;
  const topo = 104 - cheio * 78;
  const coluna = 12 + quente * 62; // altura da coluna do termômetro
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="320" height="200" fill={fundo} />
      <circle cx="270" cy="30" r="72" fill="#fff" opacity="0.35" />
      <circle cx="40" cy="190" r="58" fill="#fff" opacity="0.3" />
      <g transform="translate(96 44)">
        <path d={`M4 ${topo} q12 -7 24 0 t24 0 t24 0 t20 0 V104 a12 12 0 0 1 -12 12 H16 a12 12 0 0 1 -12 -12 Z`} fill="#2aa5e8" />
        <path d={`M4 ${topo} q12 -7 24 0 t24 0 t24 0 t20 0`} fill="none" stroke="#8fd3fa" strokeWidth="3" />
        <path d="M0 0 H96 M4 0 V104 a12 12 0 0 0 12 12 H80 a12 12 0 0 0 12 -12 V0" fill="none" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {[26, 52, 78].map((y) => (
          <path key={y} d={`M92 ${y} h-12`} stroke="#1f2937" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
        ))}
      </g>
      <g transform="translate(222 52)">
        <rect x="-7" y="0" width="14" height="86" rx="7" fill="#fff" stroke="#1f2937" strokeWidth="4" />
        <circle cx="0" cy="92" r="14" fill="#fff" stroke="#1f2937" strokeWidth="4" />
        <circle cx="0" cy="92" r="8" fill={calor} />
        <rect x="-3" y={86 - coluna} width="6" height={coluna + 4} rx="3" fill={calor} />
      </g>
      {quente > 0.45 &&
        [124, 144, 164].map((x, i) => (
          <path key={x} d={`M${x} 34 q-7 -9 0 -17 t0 -15`} fill="none" stroke={calor} strokeWidth="4" strokeLinecap="round" opacity={0.3 + quente * 0.45 - i * 0.05} />
        ))}
    </svg>
  );
}

function CartaoProduto({ produto, faixas, adicionar }: { produto: Produto; faixas: Catalogo['faixas']; adicionar: (volume: number, temperatura: number) => void }) {
  const { t, idioma } = useIdioma();
  // no sob medida o cliente escolhe só volume e temperatura; vazão e pressão vêm do produto
  const [campos, setCampos] = useState({ volume: String(produto.receita.volume), temperatura: String(produto.receita.temperatura) });
  const receita: Receita = produto.sobMedida
    ? { ...produto.receita, volume: numeroDe(campos.volume), temperatura: numeroDe(campos.temperatura) }
    : produto.receita;
  const erros = produto.sobMedida ? validarReceita(receita) : [];
  const campo = (chave: 'volume' | 'temperatura', rotulo: string, unidade: string, passo: number) => {
    const erro = erros.find((x) => x.campo === chave);
    return (
      <Entrada
        rotulo={`${rotulo} (${unidade})`}
        type="number"
        inputMode="decimal"
        step={passo}
        min={faixas[chave].min}
        max={faixas[chave].max}
        value={campos[chave]}
        onChange={(e) => setCampos({ ...campos, [chave]: e.target.value })}
        dica={`${t.vitrine.de} ${fmtNum(faixas[chave].min, idioma, 0)} ${t.vitrine.a} ${fmtNum(faixas[chave].max, idioma, 0)} ${unidade}`}
        erro={erro ? `${t.erros[erro.codigo]}: ${fmtNum(faixas[chave].min, idioma, 0)}–${fmtNum(faixas[chave].max, idioma, 0)} ${unidade}` : null}
      />
    );
  };

  return (
    <article className="produto">
      <div className="produto-figura">
        <Ilustracao volume={receita.volume} temperatura={receita.temperatura} faixas={faixas} />
        {produto.sobMedida && <span className="produto-etiqueta">{t.vitrine.sobMedida}</span>}
      </div>
      <div className="produto-corpo">
        <h2>{produto.nome}</h2>
        {produto.descricao && <p className="suave pequeno">{produto.descricao}</p>}
        {produto.sobMedida ? (
          <div className="produto-medidas">
            {campo('volume', t.comum.volume, t.unidades.litros, 0.5)}
            {campo('temperatura', t.comum.temperatura, t.unidades.celsius, 1)}
          </div>
        ) : (
          <ul className="ficha">
            <li><Icone nome="gota" tamanho={14} /> {fmtNum(produto.receita.volume, idioma)} {t.unidades.litros}</li>
            <li>
              <Icone nome="termometro" tamanho={14} /> {fmtNum(produto.receita.temperatura, idioma, 0)} {t.unidades.celsius} ±{fmtNum(produto.tolerancias.temperatura, idioma, 0)}
            </li>
            <li><Icone nome="vazao" tamanho={14} /> {fmtNum(produto.receita.vazao, idioma)} {t.unidades.lmin}</li>
          </ul>
        )}
        {produto.prazoEstimado && (
          <div className="prazo">
            <Icone nome="relogio" tamanho={15} /> {t.vitrine.prontoPorVolta} {fmtHora(produto.prazoEstimado, idioma, false)}
          </div>
        )}
        <div className="produto-rodape">
          <div className="preco">{fmtMoeda(produto.preco, idioma)}</div>
          <Botao variante="primario" icone="mais" disabled={erros.length > 0} onClick={() => adicionar(receita.volume, receita.temperatura)} aria-label={`${t.vitrine.adicionar}: ${produto.nome}`}>
            {t.vitrine.adicionar}
          </Botao>
        </div>
      </div>
    </article>
  );
}

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
