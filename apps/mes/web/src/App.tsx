// A tela do MES: fila, bancada, qualidade, indicadores, detalhe da OP e configuração da bancada. Rotas por hash.
// Os pedidos e a vitrine são da Loja, que tem a tela dela (link no topo).

import { ProvedorAvisos, ProvedorIdioma, Topo, useRota } from '@aupro/interface';
import { useBancada } from './bancada.ts';
import { textos, useIdioma } from './i18n/index.ts';
import { Bancada, DetalheOp, Fila, Indicadores, Qualidade } from './paginas/mes.tsx';
import { Configuracao } from './paginas/configuracao.tsx';

export function App() {
  return (
    <ProvedorIdioma textos={textos}>
      <ProvedorAvisos>
        <Telas />
      </ProvedorAvisos>
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
        extra={<EstadoClp />}
        marcada={marcada}
        menu={[
          { rota: '', rotulo: t.menu.fila },
          { rota: 'bancada', rotulo: t.menu.bancada },
          { rota: 'qualidade', rotulo: t.menu.qualidade },
          { rota: 'indicadores', rotulo: t.menu.indicadores },
          { rota: 'configuracao', rotulo: t.menu.configuracao },
        ]}
      />
      <main id="conteudo" tabIndex={-1} className={secao === 'bancada' ? 'painel' : undefined}>{pagina}</main>
    </>
  );
}

/** No topo de todas as telas do MES: a comunicação com o CLP (leva à Bancada). */
function EstadoClp() {
  const { t } = useIdioma();
  const { bancada } = useBancada();
  if (!bancada) return null;
  const semClp = !bancada.conectado || !bancada.clpVivo || bancada.comunicacaoPerdida;
  const ok = !semClp && !bancada.alarme;
  const texto = !bancada.conectado ? t.bancada.desconectado : semClp ? t.bancada.clpParado
    : bancada.alarme ? `${t.bancada.alarme}: ${t.alarme[bancada.alarme] ?? bancada.alarme}` : t.bancada.clpVivo;
  return (
    <a className={`topo-estado${ok ? '' : ' ruim'}`} href="#/bancada" aria-label={texto} title={texto}>
      <span>{texto}</span>
    </a>
  );
}
