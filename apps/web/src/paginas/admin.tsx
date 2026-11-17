// Administração (professor): configuração da bancada e reinício da aula.

import { useEffect, useState } from 'react';
import { useIdioma } from '../i18n/index.ts';
import { api, useDados } from '../infra.ts';
import { Carregando, Cartao, MensagemErro, Selo } from '../componentes.tsx';
import type { Configuracao as TipoConfiguracao } from '../tipos.ts';

type SaudeGateway = { driver: string; conectado: boolean; assinaturaOk: boolean; erro: string | null };

export function Configuracao() {
  const { t } = useIdioma();
  const { dados, recarregar } = useDados<TipoConfiguracao>('/api/admin/configuracao');
  const gateway = useDados<SaudeGateway>('/api/admin/gateway', [], 3000);
  const [form, setForm] = useState<TipoConfiguracao | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [achados, setAchados] = useState<{ mes: number | null; processo: number | null } | null>(null);

  useEffect(() => {
    if (dados) setForm(dados);
  }, [dados]);

  if (!form) return <Carregando />;

  const mudar = <K extends keyof TipoConfiguracao>(k: K, v: TipoConfiguracao[K]) => setForm({ ...form, [k]: v });
  const numeroCampo = (k: 'rack' | 'slot' | 'numeroDb' | 'escalaSimulador' | 'margemPrazoMin', rotulo: string) => (
    <label>
      <span>{rotulo}</span>
      <input type="number" value={form[k]} onChange={(e) => mudar(k, Number(e.target.value))} />
    </label>
  );

  async function executar(fn: () => Promise<void>) {
    setErro(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setErro(e);
    }
  }

  const s7 = form.driver === 's7';
  return (
    <>
      <Cartao titulo={t.configuracao.titulo}>
        <div className="campos">
          <label>
            <span>{t.configuracao.driver}</span>
            <select value={form.driver} onChange={(e) => mudar('driver', e.target.value as TipoConfiguracao['driver'])}>
              <option value="simulado">{t.bancada.drivers.simulado}</option>
              <option value="s7">{t.bancada.drivers.s7}</option>
            </select>
          </label>
          {s7 && (
            <>
              <label>
                <span>{t.configuracao.ip}</span>
                <input value={form.ip} onChange={(e) => mudar('ip', e.target.value)} />
              </label>
              {numeroCampo('rack', t.configuracao.rack)}
              {numeroCampo('slot', t.configuracao.slot)}
              {numeroCampo('numeroDb', t.configuracao.numeroDb)}
              <label>
                <span>{t.configuracao.numeroDbProcesso}</span>
                <input
                  type="number"
                  value={form.numeroDbProcesso ?? ''}
                  onChange={(e) => mudar('numeroDbProcesso', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            </>
          )}
          {!s7 && numeroCampo('escalaSimulador', t.configuracao.escala)}
          {numeroCampo('margemPrazoMin', t.configuracao.margem)}
        </div>
        <label className="marcar">
          <input type="checkbox" checked={form.inspecaoAutomatica} onChange={(e) => mudar('inspecaoAutomatica', e.target.checked)} />
          <span>{t.configuracao.inspecaoAutomatica}</span>
        </label>
        {s7 && <div className="aviso aviso-atencao pequeno">{t.configuracao.avisoPutGet}</div>}
        <MensagemErro erro={erro} />
        {aviso && <div className="aviso aviso-ok">{aviso}</div>}
        {achados && (
          <div className="aviso aviso-info">
            {t.configuracao.encontrados}: DB MES = {achados.mes ?? t.configuracao.naoEncontrado} · DB MB_Simulador ={' '}
            {achados.processo ?? t.configuracao.naoEncontrado}
          </div>
        )}
        <div className="linha">
          <button
            className="primario"
            onClick={() =>
              executar(async () => {
                await api('/api/admin/configuracao', { metodo: 'PUT', corpo: form });
                setAviso(t.configuracao.salvo);
                recarregar();
              })
            }
          >
            {t.comum.salvar}
          </button>
          {s7 && (
            <button
              disabled={procurando}
              onClick={() =>
                executar(async () => {
                  setProcurando(true);
                  setAchados(null);
                  try {
                    const r = await api<{ mes: number | null; processo: number | null }>('/api/admin/procurar-db', { corpo: form });
                    setAchados(r);
                    setForm({ ...form, numeroDb: r.mes ?? form.numeroDb, numeroDbProcesso: r.processo ?? form.numeroDbProcesso });
                  } finally {
                    setProcurando(false);
                  }
                })
              }
            >
              {procurando ? t.configuracao.procurando : t.configuracao.procurar}
            </button>
          )}
        </div>
      </Cartao>

      <Cartao titulo={t.configuracao.gateway}>
        {gateway.dados ? (
          <div className="linha">
            <Selo tom={gateway.dados.conectado ? 'ok' : 'ruim'}>
              {gateway.dados.conectado ? t.bancada.conectado : t.bancada.desconectado}
            </Selo>
            {gateway.dados.conectado && (
              <Selo tom={gateway.dados.assinaturaOk ? 'ok' : 'ruim'}>
                {gateway.dados.assinaturaOk ? t.configuracao.assinaturaOk : t.configuracao.assinaturaRuim}
              </Selo>
            )}
            {gateway.dados.erro && <span className="suave pequeno">{gateway.dados.erro}</span>}
          </div>
        ) : (
          <MensagemErro erro={gateway.erro} />
        )}
      </Cartao>

      <Cartao titulo={t.configuracao.reiniciar}>
        <p className="suave">{t.configuracao.reiniciarTexto}</p>
        <button
          className="perigo"
          onClick={() =>
            confirm(t.configuracao.reiniciarConfirma) &&
            executar(async () => {
              await api('/api/admin/reiniciar', { corpo: {} });
              setAviso(t.configuracao.reiniciado);
            })
          }
        >
          {t.configuracao.reiniciar}
        </button>
      </Cartao>
    </>
  );
}
