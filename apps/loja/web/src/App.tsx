// A tela da Loja (ERP): vitrine, pedidos, faturas, catálogo, certificado. Rotas por hash. Sem login e sem papéis.
// A produção (fila, bancada, qualidade, indicadores) é do MES, que tem a tela dele (link no topo).

import { Icone, ProvedorAvisos, ProvedorIdioma, Topo, useRota } from '@aupro/interface';
import { textos, useIdioma } from './i18n/index.ts';
import { ProvedorCarrinho, useCarrinho } from './carrinho.tsx';
import { Acompanhamento, Certificado } from './paginas/loja.tsx';
import { Vitrine } from './paginas/vitrine.tsx';
import { Vendas } from './paginas/erp.tsx';
import { Configuracao } from './paginas/configuracao.tsx';

export function App() {
  return (
    <ProvedorIdioma textos={textos}>
      <ProvedorAvisos>
        <ProvedorCarrinho>
          <Telas />
        </ProvedorCarrinho>
      </ProvedorAvisos>
    </ProvedorIdioma>
  );
}

/** O carrinho no topo, em todas as telas da Loja: o número de unidades; abre a revisão do pedido. */
function BotaoCarrinho({ ativo }: { ativo: boolean }) {
  const { t } = useIdioma();
  const { unidades } = useCarrinho();
  return (
    <a
      className="topo-botao loja-topo-carrinho"
      href="#/revisar"
      aria-label={`${t.vitrine.carrinho}: ${unidades} ${unidades === 1 ? t.vitrine.unidade : t.vitrine.unidades}`}
      aria-current={ativo ? 'page' : undefined}
      title={t.vitrine.carrinho}
    >
      <Icone nome="carrinho" />
      <span className="loja-topo-contador" aria-hidden="true">{unidades}</span>
    </a>
  );
}

function Telas() {
  const [secao, ...resto] = useRota();
  const { t } = useIdioma();
  const n = Number(resto[0]);
  const navegar = (r: string) => {
    location.hash = r;
  };
  const pagina =
    secao === 'pedido' && resto[0] ? <Acompanhamento id={n} />
    : secao === 'certificado' && resto[0] ? <Certificado numero={n} />
    : secao === 'pedidos' ? <Vendas />
    : secao === 'configuracao' ? <Configuracao />
    : <Vitrine navegar={navegar} revisar={secao === 'revisar'} />;
  // acompanhamento, certificado e revisão ficam marcados na vitrine
  const marcada = secao === 'pedidos' || secao === 'configuracao' ? secao : '';

  return (
    <>
      <Topo
        sistema="loja"
        marcada={marcada}
        menu={[
          { rota: '', rotulo: t.menu.loja },
          { rota: 'pedidos', rotulo: t.menu.pedidos },
          { rota: 'configuracao', rotulo: t.menu.configuracao },
        ]}
        extra={<BotaoCarrinho ativo={secao === 'revisar'} />}
        menuCompacto
      />
      <main id="conteudo" tabIndex={-1}>{pagina}</main>
    </>
  );
}
