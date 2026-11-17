// Retaguarda: escolha de papel e nome (sem senha) e as abas de cada papel.

import { useState } from 'react';
import { useIdioma } from '../i18n/index.ts';
import { lerSessao, salvarSessao, type Papel, type Sessao } from '../infra.ts';
import { Cartao } from '../componentes.tsx';
import { Bancada, DetalheOp, Fila, Indicadores, Qualidade } from './mes.tsx';
import { Catalogo, Vendas } from './erp.tsx';
import { Configuracao } from './admin.tsx';

type Aba = 'vendas' | 'fila' | 'bancada' | 'qualidade' | 'indicadores' | 'catalogo' | 'configuracao';

const ABAS_DO_PAPEL: Record<Papel, Aba[]> = {
  vendas: ['vendas'],
  pcp: ['fila', 'indicadores'],
  operador: ['bancada', 'qualidade'],
  qualidade: ['qualidade', 'indicadores'],
  professor: ['vendas', 'fila', 'bancada', 'qualidade', 'indicadores', 'catalogo', 'configuracao'],
};

export function Retaguarda({ caminho }: { caminho: string[] }) {
  const { t } = useIdioma();
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);

  if (!sessao) {
    return (
      <Entrar
        aoEntrar={(s) => {
          salvarSessao(s);
          setSessao(s);
        }}
      />
    );
  }

  const abas = ABAS_DO_PAPEL[sessao.papel];
  const [primeiro, segundo] = caminho;
  const detalheOp = primeiro === 'op' && segundo ? Number(segundo) : null;
  const aba: Aba = (abas as string[]).includes(primeiro) ? (primeiro as Aba) : abas[0];

  return (
    <>
      <div className="linha">
        <nav className="abas espaco">
          {abas.map((a) => (
            <a key={a} href={`#/retaguarda/${a}`} className={a === aba && detalheOp === null ? 'ativo' : ''}>
              {t.retaguarda.abas[a]}
            </a>
          ))}
        </nav>
        <span className="suave pequeno">
          {sessao.nome} · {t.retaguarda.papeis[sessao.papel]}
        </span>
        <button
          className="pequeno"
          onClick={() => {
            salvarSessao(null);
            setSessao(null);
          }}
        >
          {t.retaguarda.trocar}
        </button>
      </div>
      {detalheOp !== null ? (
        <DetalheOp numero={detalheOp} />
      ) : aba === 'vendas' ? (
        <Vendas />
      ) : aba === 'fila' ? (
        <Fila />
      ) : aba === 'bancada' ? (
        <Bancada papel={sessao.papel} />
      ) : aba === 'qualidade' ? (
        <Qualidade />
      ) : aba === 'indicadores' ? (
        <Indicadores />
      ) : aba === 'catalogo' ? (
        <Catalogo />
      ) : (
        <Configuracao />
      )}
    </>
  );
}

function Entrar({ aoEntrar }: { aoEntrar: (s: Sessao) => void }) {
  const { t } = useIdioma();
  const [papel, setPapel] = useState<Papel>('operador');
  const [nome, setNome] = useState('');
  return (
    <div style={{ maxWidth: 420 }}>
      <Cartao titulo={t.retaguarda.entrar}>
        <p className="suave pequeno">{t.retaguarda.entrarTexto}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) aoEntrar({ papel, nome: nome.trim() });
          }}
        >
          <label>
            <span>{t.retaguarda.papel}</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {(Object.keys(t.retaguarda.papeis) as Papel[]).map((p) => (
                <option key={p} value={p}>
                  {t.retaguarda.papeis[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.retaguarda.seuNome}</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </label>
          <button className="primario" type="submit" disabled={!nome.trim()}>
            {t.retaguarda.entrarBotao}
          </button>
        </form>
      </Cartao>
    </div>
  );
}
