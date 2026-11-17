// A tela do MES: fila, bancada, qualidade, indicadores, detalhe da OP e configuração da bancada. Rotas por hash.
// Os pedidos e a vitrine são da Loja, que tem a tela dela (link no topo).

import { ProvedorIdioma, Topo, useRota } from '@aupro/interface';
import { textos, useIdioma } from './i18n/index.ts';
import { Bancada, DetalheOp, Fila, Indicadores, Qualidade } from './paginas/mes.tsx';
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
  const pagina =
    secao === 'op' && resto[0] ? <DetalheOp numero={Number(resto[0])} />
    : secao === 'bancada' ? <Bancada />
    : secao === 'qualidade' ? <Qualidade />
    : secao === 'indicadores' ? <Indicadores />
    : secao === 'configuracao' ? <Configuracao />
    : <Fila />;
  // o detalhe da OP fica marcado na Fila
  const marcada = secao === undefined || secao === 'op' ? '' : secao;

  return (
    <>
      <Topo
        sistema="mes"
        marcada={marcada}
        menu={[
          { rota: '', rotulo: t.menu.fila },
          { rota: 'bancada', rotulo: t.menu.bancada },
          { rota: 'qualidade', rotulo: t.menu.qualidade },
          { rota: 'indicadores', rotulo: t.menu.indicadores },
          { rota: 'configuracao', rotulo: t.menu.configuracao },
        ]}
      />
      <main>{pagina}</main>
    </>
  );
}
