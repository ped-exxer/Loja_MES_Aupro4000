// Vitrine: o pedido em passos (volume, temperatura, quantidade, revisar), com as receitas prontas como atalho, a
// ilustração da escolha e o carrinho. Cada unidade confirmada vira uma OP no MES. As escolhas caem nos produtos do
// catálogo pela regra de ../escolha.ts (sem mudar a API).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { validarReceita } from '@aupro/dominio';
import { useIdioma } from '../i18n/index.ts';
import { MAX_UNIDADES, useCarrinho, type LinhaSalva } from '../carrinho.tsx';
import {
  ESCOLHA_VAZIA, opcoesTemperatura, opcoesVolume, produtoDa, prontas, receitaDa, sobMedida, tipoTemperatura, type Escolha,
} from '../escolha.ts';
import {
  Aviso, Botao, Cartao, Entrada, FalhaAoCarregar, Icone, MensagemErro, Vazio,
  erroDoCampo, fmtHora, fmtMoeda, fmtNum, numeroDe, useAcao, useDados, api,
} from '@aupro/interface';
import type { Catalogo, Produto } from '@aupro/interface';

type Passo = 'volume' | 'temperatura' | 'quantidade' | 'revisar';
const PASSOS: Passo[] = ['volume', 'temperatura', 'quantidade', 'revisar'];

/** Valor escolhido num passo: uma das opções, ou o "outro valor" digitado (só com o produto Sob medida). */
type Campo = { livre: boolean; texto: string };

export function Vitrine({ navegar, revisar }: { navegar: (rota: string) => void; revisar: boolean }) {
  const { t } = useIdioma();
  const { dados, erro, recarregar } = useDados<Catalogo>('/api/loja/catalogo', ['producao', 'reiniciado'], 15_000);
  const carrinho = useCarrinho();
  const [escolha, setEscolha] = useState<Escolha>(ESCOLHA_VAZIA);
  const [campos, setCampos] = useState<{ volume: Campo; temperatura: Campo }>({ volume: { livre: false, texto: '' }, temperatura: { livre: false, texto: '' } });
  const [passoFluxo, setPassoFluxo] = useState<Exclude<Passo, 'revisar'>>('volume');
  const [quantidade, setQuantidade] = useState(1);
  const passo: Passo = revisar ? 'revisar' : passoFluxo;

  // o foco vai para o título do passo quando o cliente muda de passo (não na primeira abertura da tela)
  const titulo = useRef<HTMLHeadingElement>(null);
  const mudou = useRef(false);
  useEffect(() => {
    if (mudou.current) titulo.current?.focus();
    mudou.current = true;
  }, [passo]);

  if (!dados) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Esqueleto />;

  const produto = produtoDa(dados, escolha);
  const restante = Math.max(0, MAX_UNIDADES - carrinho.unidades);
  const irPara = (p: Passo) => {
    if (p === 'revisar') navegar('/revisar');
    else {
      setPassoFluxo(p);
      if (revisar) navegar('/');
    }
  };
  const mudarEscolha = (campo: 'volume' | 'temperatura', valor: number, c: Campo) => {
    // mudar volume ou temperatura desfaz a receita pronta: a combinação nova é conferida de novo
    setEscolha((e) => ({ ...e, prontaId: null, [campo]: valor }));
    setCampos((a) => ({ ...a, [campo]: c }));
  };
  const usarPronta = (p: Produto) => {
    setEscolha({ prontaId: p.id, volume: p.receita.volume, temperatura: p.receita.temperatura });
    setCampos({ volume: { livre: false, texto: '' }, temperatura: { livre: false, texto: '' } });
    setQuantidade(1);
    setPassoFluxo('quantidade');
  };
  const adicionar = () => {
    if (!produto) return;
    const receita = receitaDa(produto, escolha);
    carrinho.adicionar({ produtoId: produto.id, volume: receita.volume, temperatura: receita.temperatura, quantidade: Math.min(quantidade, restante) });
    // o fluxo recomeça limpo para o próximo tipo
    setEscolha(ESCOLHA_VAZIA);
    setCampos({ volume: { livre: false, texto: '' }, temperatura: { livre: false, texto: '' } });
    setQuantidade(1);
    setPassoFluxo('volume');
    navegar('/revisar');
  };

  // até onde dá para ir: cada passo precisa do anterior resolvido
  const volumeOk = Number.isFinite(escolha.volume) && escolha.volume >= dados.faixas.volume.min && escolha.volume <= dados.faixas.volume.max;
  const alcancavel: Record<Passo, boolean> = {
    volume: true,
    temperatura: volumeOk,
    quantidade: produto !== null,
    revisar: carrinho.linhas.length > 0,
  };

  return (
    <>
      <header className="vitrine-capa">
        <h1>{t.vitrine.titulo}</h1>
        <p>{t.vitrine.subtitulo}</p>
      </header>
      {!dados.mesNoAr && <Aviso tom="atencao">{t.vitrine.mesForaDoAr}</Aviso>}
      {dados.produtos.length === 0 ? (
        <Cartao>
          <Vazio titulo={t.vitrine.semProdutos} />
        </Cartao>
      ) : (
        <>
          <Progresso passo={passo} alcancavel={alcancavel} irPara={irPara} />
          {passo === 'revisar' ? (
            <Revisao catalogo={dados} titulo={titulo} navegar={navegar} outro={() => irPara('volume')} />
          ) : (
            <div className="loja-pedido">
              <section className="cartao loja-passo" aria-labelledby="loja-passo-titulo">
                {passo === 'volume' && (
                  <>
                    <Prontas catalogo={dados} escolhida={escolha.prontaId} usar={usarPronta} />
                    <PassoValor
                      catalogo={dados}
                      chave="volume"
                      titulo={t.vitrine.perguntaVolume}
                      tituloRef={titulo}
                      valor={escolha.volume}
                      campo={campos.volume}
                      mudar={(v, c) => mudarEscolha('volume', v, c)}
                    />
                  </>
                )}
                {passo === 'temperatura' && (
                  <PassoValor
                    catalogo={dados}
                    chave="temperatura"
                    titulo={t.vitrine.perguntaTemperatura}
                    tituloRef={titulo}
                    valor={escolha.temperatura}
                    campo={campos.temperatura}
                    mudar={(v, c) => mudarEscolha('temperatura', v, c)}
                  />
                )}
                {passo === 'quantidade' && produto && (
                  <PassoQuantidade tituloRef={titulo} quantidade={Math.min(quantidade, Math.max(1, restante))} restante={restante} noCarrinho={carrinho.unidades} mudar={setQuantidade} />
                )}
                <div className="loja-navegar">
                  {passo !== 'volume' && (
                    <Botao icone="voltar" onClick={() => setPassoFluxo(passo === 'quantidade' && escolha.prontaId !== null ? 'volume' : PASSOS[PASSOS.indexOf(passo) - 1] as Exclude<Passo, 'revisar'>)}>
                      {t.vitrine.voltar}
                    </Botao>
                  )}
                  <span className="espaco" />
                  {passo === 'quantidade' ? (
                    <Botao variante="primario" icone="mais" disabled={!produto || restante === 0} onClick={adicionar}>
                      {t.vitrine.adicionarPedido}
                    </Botao>
                  ) : (
                    <Botao variante="primario" disabled={!alcancavel[PASSOS[PASSOS.indexOf(passo) + 1]]} onClick={() => setPassoFluxo(passo === 'volume' ? 'temperatura' : 'quantidade')}>
                      {t.vitrine.continuar} <Icone nome="seta" tamanho={18} />
                    </Botao>
                  )}
                </div>
              </section>
              <Resumo catalogo={dados} escolha={escolha} produto={produto} revisar={() => irPara('revisar')} />
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------- partes do fluxo ----------------

/** Os passos, com o atual marcado; os já alcançáveis são botões. */
function Progresso({ passo, alcancavel, irPara }: { passo: Passo; alcancavel: Record<Passo, boolean>; irPara: (p: Passo) => void }) {
  const { t } = useIdioma();
  const atual = PASSOS.indexOf(passo);
  return (
    <nav className="loja-progresso" aria-label={`${t.vitrine.passo} ${atual + 1} ${t.vitrine.passoDe} ${PASSOS.length}`}>
      <p className="loja-progresso-texto" aria-hidden="true">
        {t.vitrine.passo} {atual + 1} {t.vitrine.passoDe} {PASSOS.length} · <strong>{t.vitrine.passos[passo]}</strong>
      </p>
      <ol>
        {PASSOS.map((p, i) => {
          const classe = i < atual ? 'feito' : i === atual ? 'atual' : '';
          const conteudo = (
            <>
              <span className="loja-progresso-marca">{i < atual ? <Icone nome="certo" tamanho={14} /> : i + 1}</span>
              <span className="loja-progresso-nome">{t.vitrine.passos[p]}</span>
            </>
          );
          return (
            <li key={p} className={classe} aria-current={i === atual ? 'step' : undefined}>
              {i !== atual && alcancavel[p] ? (
                <button type="button" onClick={() => irPara(p)}>{conteudo}</button>
              ) : (
                <span className="loja-progresso-item">{conteudo}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** O atalho: as receitas prontas do catálogo. Escolher uma preenche volume e temperatura e vai à quantidade. */
function Prontas({ catalogo, escolhida, usar }: { catalogo: Catalogo; escolhida: number | null; usar: (p: Produto) => void }) {
  const { t, idioma } = useIdioma();
  const lista = prontas(catalogo);
  if (lista.length === 0) return null;
  return (
    <div className="loja-prontas">
      <h3 id="loja-prontas-titulo">{t.vitrine.receitasProntas}</h3>
      <p className="suave pequeno">{t.vitrine.receitasDica}</p>
      <ul aria-labelledby="loja-prontas-titulo">
        {lista.map((p) => (
          <li key={p.id}>
            <button type="button" className={`loja-pronta${escolhida === p.id ? ' escolhida' : ''}`} aria-pressed={escolhida === p.id} onClick={() => usar(p)}>
              <span className="loja-pronta-figura"><Ilustracao volume={p.receita.volume} temperatura={p.receita.temperatura} faixas={catalogo.faixas} /></span>
              <span className="loja-pronta-texto">
                <strong>{p.nome}</strong>
                <span className="suave">
                  {fmtNum(p.receita.volume, idioma)} {t.unidades.litros} · {fmtNum(p.receita.temperatura, idioma, 0)} {t.unidades.celsius} · {fmtNum(p.receita.vazao, idioma)} {t.unidades.lmin}
                </span>
                <span className="loja-pronta-preco">{fmtMoeda(p.preco, idioma)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Um passo de valor (volume ou temperatura): as opções das receitas prontas e, com o Sob medida, um valor livre. */
function PassoValor({ catalogo, chave, titulo, tituloRef, valor, campo, mudar }: {
  catalogo: Catalogo;
  chave: 'volume' | 'temperatura';
  titulo: string;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  valor: number;
  campo: Campo;
  mudar: (valor: number, campo: Campo) => void;
}) {
  const { t, idioma } = useIdioma();
  const faixa = catalogo.faixas[chave];
  const unidade = chave === 'volume' ? t.unidades.litros : t.unidades.celsius;
  const casas = chave === 'volume' ? 1 : 0;
  const opcoes = chave === 'volume' ? opcoesVolume(catalogo) : opcoesTemperatura(catalogo);
  const medida = sobMedida(catalogo);
  const nome = `loja-${chave}`;
  const erroLivre = (() => {
    if (!campo.livre || !medida || campo.texto.trim() === '') return null;
    const e = validarReceita({ ...medida.receita, [chave]: numeroDe(campo.texto) }).find((x) => x.campo === chave);
    return e ? `${t.erros[e.codigo]}: ${fmtNum(faixa.min, idioma, 0)}–${fmtNum(faixa.max, idioma, 0)} ${unidade}` : null;
  })();
  const rotulo = (v: number) => (chave === 'temperatura' ? t.vitrine[tipoTemperatura(catalogo, v)] : null);

  return (
    <fieldset className="loja-opcoes">
      <legend>
        <h2 id="loja-passo-titulo" ref={tituloRef} tabIndex={-1}>{titulo}</h2>
      </legend>
      <div className="loja-opcoes-lista">
        {opcoes.map((v) => (
          <label key={v} className="loja-opcao">
            <input type="radio" name={nome} checked={!campo.livre && valor === v} onChange={() => mudar(v, { livre: false, texto: '' })} />
            <span className="loja-opcao-valor">{fmtNum(v, idioma, casas)} {unidade}</span>
            {rotulo(v) && <span className="loja-opcao-apoio">{rotulo(v)}</span>}
          </label>
        ))}
        {medida && (
          <label className="loja-opcao">
            <input
              type="radio"
              name={nome}
              checked={campo.livre}
              onChange={() => {
                const texto = campo.texto || (Number.isFinite(valor) ? String(valor) : String(medida.receita[chave]));
                mudar(numeroDe(texto), { livre: true, texto });
              }}
            />
            <span className="loja-opcao-valor">{t.vitrine.outroValor}</span>
            <span className="loja-opcao-apoio">{t.vitrine.sobMedida}</span>
          </label>
        )}
      </div>
      {campo.livre && medida && (
        <Entrada
          className="loja-livre"
          rotulo={`${chave === 'volume' ? t.comum.volume : t.comum.temperatura} (${unidade})`}
          type="number"
          inputMode="decimal"
          step={chave === 'volume' ? 0.5 : 1}
          min={faixa.min}
          max={faixa.max}
          value={campo.texto}
          autoFocus
          onChange={(e) => mudar(numeroDe(e.target.value), { livre: true, texto: e.target.value })}
          dica={`${t.vitrine.de} ${fmtNum(faixa.min, idioma, 0)} ${t.vitrine.a} ${fmtNum(faixa.max, idioma, 0)} ${unidade}`}
          erro={erroLivre}
        />
      )}
      {!medida && <p className="suave pequeno">{t.vitrine.semSobMedida}</p>}
    </fieldset>
  );
}

/** Quantas unidades: − N +, travado no que ainda cabe no pedido (somando o carrinho). */
function PassoQuantidade({ tituloRef, quantidade, restante, noCarrinho, mudar }: {
  tituloRef: RefObject<HTMLHeadingElement | null>;
  quantidade: number;
  restante: number;
  noCarrinho: number;
  mudar: (n: number) => void;
}) {
  const { t } = useIdioma();
  const un = (n: number) => `${n} ${n === 1 ? t.vitrine.unidade : t.vitrine.unidades}`;
  return (
    <div className="loja-quantidade">
      <h2 id="loja-passo-titulo" ref={tituloRef} tabIndex={-1}>{t.vitrine.perguntaQuantidade}</h2>
      {restante === 0 ? (
        <Aviso tom="atencao">{t.vitrine.limiteAtingido} {MAX_UNIDADES} {t.vitrine.unidades}.</Aviso>
      ) : (
        <>
          <Contador valor={quantidade} min={1} max={restante} mudar={mudar} rotulo={t.vitrine.quantidade} grande />
          {quantidade >= restante ? (
            <Aviso tom="atencao">
              {t.vitrine.limitePedido} {MAX_UNIDADES} {t.vitrine.unidades}
              {noCarrinho > 0 && ` (${un(noCarrinho)} ${t.vitrine.jaNoCarrinho})`}.
            </Aviso>
          ) : (
            <p className="suave pequeno">
              {t.vitrine.cabemMais} {un(restante)} · {t.vitrine.maximo} {MAX_UNIDADES}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Contador({ valor, min, max, mudar, rotulo, grande }: { valor: number; min: number; max: number; mudar: (n: number) => void; rotulo: string; grande?: boolean }) {
  const { t } = useIdioma();
  return (
    <div className={`quantidade${grande ? ' loja-contador-grande' : ''}`} role="group" aria-label={rotulo}>
      <button type="button" onClick={() => mudar(valor - 1)} disabled={valor <= min} aria-label={t.vitrine.menos}>
        <Icone nome="menos" tamanho={grande ? 20 : 15} />
      </button>
      <output aria-live="polite">{valor}</output>
      <button type="button" onClick={() => mudar(valor + 1)} disabled={valor >= max} aria-label={t.vitrine.mais}>
        <Icone nome="mais" tamanho={grande ? 20 : 15} />
      </button>
    </div>
  );
}

/** A "foto" da escolha: a ilustração, o produto em que ela cai, a ficha, o preço e o prazo; e o carrinho. */
function Resumo({ catalogo, escolha, produto, revisar }: { catalogo: Catalogo; escolha: Escolha; produto: Produto | null; revisar: () => void }) {
  const { t, idioma } = useIdioma();
  const carrinho = useCarrinho();
  const receita = produto ? receitaDa(produto, escolha) : null;
  const total = carrinho.linhas.reduce((s, l) => s + (catalogo.produtos.find((p) => p.id === l.produtoId)?.preco ?? 0) * l.quantidade, 0);
  return (
    <aside className="cartao loja-resumo" aria-label={t.vitrine.suaEscolha}>
      <div className="loja-resumo-figura">
        <Ilustracao volume={escolha.volume} temperatura={escolha.temperatura} faixas={catalogo.faixas} />
        {produto?.sobMedida && <span className="produto-etiqueta">{t.vitrine.sobMedida}</span>}
      </div>
      <div className="loja-resumo-corpo" aria-live="polite">
        <div className="suave pequeno">{t.vitrine.suaEscolha}</div>
        {produto && <h2>{produto.nome}</h2>}
        {Number.isFinite(escolha.volume) || Number.isFinite(escolha.temperatura) ? (
          <ul className="ficha">
            {Number.isFinite(escolha.volume) && <li><Icone nome="gota" tamanho={14} /> {fmtNum(escolha.volume, idioma)} {t.unidades.litros}</li>}
            {Number.isFinite(escolha.temperatura) && <li><Icone nome="termometro" tamanho={14} /> {fmtNum(escolha.temperatura, idioma, 0)} {t.unidades.celsius}</li>}
            {receita && <li><Icone nome="vazao" tamanho={14} /> {fmtNum(receita.vazao, idioma)} {t.unidades.lmin}</li>}
          </ul>
        ) : (
          <p className="suave pequeno">{t.vitrine.escolhaVazia}</p>
        )}
        {produto && (
          <div className="loja-resumo-preco">
            <span className="preco">{fmtMoeda(produto.preco, idioma)}</span> <span className="suave pequeno">{t.vitrine.porUnidade}</span>
          </div>
        )}
        {produto?.prazoEstimado && (
          <div className="prazo">
            <Icone nome="relogio" tamanho={15} /> {t.vitrine.prontoPorVolta} {fmtHora(produto.prazoEstimado, idioma, false)}
          </div>
        )}
      </div>
      {carrinho.unidades > 0 && (
        <div className="loja-resumo-carrinho">
          <span>
            <Icone nome="carrinho" tamanho={16} /> {t.vitrine.noPedido}: {carrinho.unidades} {carrinho.unidades === 1 ? t.vitrine.unidade : t.vitrine.unidades} · <strong>{fmtMoeda(total, idioma)}</strong>
          </span>
          <Botao pequeno onClick={revisar}>{t.vitrine.revisarPedido}</Botao>
        </div>
      )}
    </aside>
  );
}

// ---------------- revisar e confirmar ----------------

function Revisao({ catalogo, titulo, navegar, outro }: { catalogo: Catalogo; titulo: RefObject<HTMLHeadingElement | null>; navegar: (rota: string) => void; outro: () => void }) {
  const { t, idioma } = useIdioma();
  const carrinho = useCarrinho();
  const [nome, setNome] = useState('');
  const [faltaNome, setFaltaNome] = useState(false);
  const pedido = useAcao();

  // produto que saiu do catálogo sai do carrinho (`indice` = a posição no carrinho guardado: é ela que os botões mudam)
  const linhas = carrinho.linhas.flatMap((l, indice): (LinhaSalva & { produto: Produto; indice: number })[] => {
    const produto = catalogo.produtos.find((p) => p.id === l.produtoId);
    return produto ? [{ ...l, produto, indice }] : [];
  });
  const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0);
  const prazo = Math.max(0, ...linhas.map((l) => l.produto.prazoEstimado ?? 0));
  const noLimite = unidades >= MAX_UNIDADES;

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

  if (linhas.length === 0) {
    return (
      <Cartao className="loja-passo">
        <h2 id="loja-passo-titulo" ref={titulo} tabIndex={-1} className="so-leitor">{t.vitrine.passos.revisar}</h2>
        <Vazio icone="carrinho" titulo={t.vitrine.carrinhoVazio}>
          <Botao variante="primario" icone="mais" onClick={outro}>{t.vitrine.montarPedido}</Botao>
        </Vazio>
      </Cartao>
    );
  }

  return (
    <div className="loja-pedido">
      <section className="cartao loja-passo" aria-labelledby="loja-passo-titulo">
        <h2 id="loja-passo-titulo" ref={titulo} tabIndex={-1}>{t.vitrine.perguntaRevisar}</h2>
        <ul className="loja-itens">
          {linhas.map((l) => (
            <li key={`${l.produtoId}-${l.volume}-${l.temperatura}`}>
              <span className="loja-item-figura"><Ilustracao volume={l.volume} temperatura={l.temperatura} faixas={catalogo.faixas} /></span>
              <div className="loja-item-texto">
                <div className="nome">{l.produto.nome}</div>
                <div className="suave pequeno">
                  {fmtNum(l.volume, idioma)} {t.unidades.litros} · {fmtNum(l.temperatura, idioma, 0)} {t.unidades.celsius} · {fmtMoeda(l.produto.preco, idioma)} {t.vitrine.porUnidade}
                </div>
              </div>
              <div className="loja-item-acoes">
                <Contador
                  valor={l.quantidade}
                  min={1}
                  max={l.quantidade + MAX_UNIDADES - unidades}
                  mudar={(n) => carrinho.mudar(l.indice, n)}
                  rotulo={`${t.vitrine.quantidade}: ${l.produto.nome}`}
                />
                <Botao pequeno variante="sutil" icone="lixo" onClick={() => carrinho.mudar(l.indice, 0)} rotulo={`${t.vitrine.remover}: ${l.produto.nome}`} />
              </div>
              <div className="valor">{fmtMoeda(l.produto.preco * l.quantidade, idioma)}</div>
            </li>
          ))}
        </ul>
        {noLimite && (
          <Aviso tom="atencao">{t.vitrine.limiteAtingido} {MAX_UNIDADES} {t.vitrine.unidades}.</Aviso>
        )}
        <Botao icone="mais" onClick={outro} disabled={noLimite}>{t.vitrine.adicionarOutro}</Botao>
      </section>

      <aside className="cartao loja-fechar" aria-label={t.vitrine.confirmar}>
        <div className="carrinho-total">
          <span>
            {t.comum.total} · {unidades} {unidades === 1 ? t.vitrine.unidade : t.vitrine.unidades}
          </span>
          <strong>{fmtMoeda(total, idioma)}</strong>
        </div>
        {prazo > 0 && (
          <div className="prazo">
            <Icone nome="relogio" tamanho={15} /> {t.vitrine.prontoPorVolta} {fmtHora(prazo, idioma, false)}
          </div>
        )}
        <p className="suave pequeno">{t.vitrine.prazoNota}</p>
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
        <Aviso tom="info" icone="info">{t.vitrine.semPagamento}</Aviso>
      </aside>
    </div>
  );
}

// ---------------- carregando ----------------

/** O desenho da tela enquanto o catálogo chega (no lugar do "Carregando…"). */
function Esqueleto() {
  const { t } = useIdioma();
  const bloco = (classe: string, estilo?: CSSProperties): ReactNode => <span className={`loja-esqueleto ${classe}`} style={estilo} />;
  return (
    <div role="status" aria-busy="true">
      <span className="so-leitor">{t.comum.carregando}</span>
      <div aria-hidden="true">
        {bloco('loja-esqueleto-capa')}
        {bloco('loja-esqueleto-linha', { width: '60%', height: '2.2rem', marginBottom: '1rem' })}
        <div className="loja-pedido">
          <div className="cartao">
            {bloco('loja-esqueleto-linha', { width: '40%' })}
            <div className="loja-opcoes-lista">
              {[1, 2, 3, 4].map((i) => <span key={i}>{bloco('loja-esqueleto-opcao')}</span>)}
            </div>
          </div>
          <div className="cartao loja-esqueleto-resumo">{bloco('loja-esqueleto-figura')}{bloco('loja-esqueleto-linha', { width: '70%' })}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------- ilustração ----------------

/** A "foto" da água: o tanque com o nível proporcional ao volume e o termômetro (e o vapor) conforme a temperatura. */
export function Ilustracao({ volume, temperatura, faixas }: { volume: number; temperatura: number; faixas: Catalogo['faixas'] }) {
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
