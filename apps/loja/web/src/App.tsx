// A tela da Loja (ERP): vitrine, pedidos, faturas, catálogo, certificado. Rotas por hash. Sem login e sem papéis.
// A produção (fila, bancada, qualidade, indicadores) é do MES, que tem a tela dele (link no topo).

import { ProvedorIdioma, Topo, useRota } from '@aupro/interface';
import { textos, useIdioma } from './i18n/index.ts';
import { Acompanhamento, Certificado, Vitrine } from './paginas/loja.tsx';
import { Vendas } from './paginas/erp.tsx';
import { Configuracao } from './paginas/configuracao.tsx';

export function App() {
  return (
    <ProvedorIdioma textos={textos}>
      <Telas />
    </ProvedorIdioma>
  );
}

function Telas() {
  const { t } = useIdioma();
  const [secao, ...resto] = useRota();
  const n = Number(resto[0]);
  const navegar = (r: string) => {
    location.hash = r;
  };
  const pagina =
    secao === 'pedido' && resto[0] ? <Acompanhamento id={n} />
    : secao === 'certificado' && resto[0] ? <Certificado numero={n} />
    : secao === 'pedidos' ? <Vendas />
    : secao === 'configuracao' ? <Configuracao />
    : <Vitrine navegar={navegar} />;
  // acompanhamento e certificado ficam marcados na vitrine
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
      />
      <main>{pagina}</main>
    </>
  );
}
