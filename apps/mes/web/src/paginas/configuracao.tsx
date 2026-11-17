// Configuração do MES: bancada (driver, CPU, DB), gateway e reinício do MES. O catálogo é da Loja.

import { useEffect, useState } from 'react';
import { useIdioma } from '../i18n/index.ts';
import { Aviso, Botao, Carregando, Cartao, Confirmacao, Entrada, FalhaAoCarregar, MensagemErro, Pagina, Selecao, Selo, api, erroDoCampo, numeroDe, useAcao, useDados } from '@aupro/interface';
import type { Configuracao as TipoConfiguracao } from '@aupro/interface';

type SaudeGateway = { driver: string; conectado: boolean; assinaturaOk: boolean; erro: string | null };

/** Os campos ficam como texto (o que a pessoa digitou); viram número só ao salvar. */
type Form = { driver: TipoConfiguracao['driver']; ip: string; rack: string; slot: string; numeroDb: string; numeroDbProcesso: string; escalaSimulador: string; margemPrazoMin: string };
type CampoNumerico = 'rack' | 'slot' | 'numeroDb' | 'numeroDbProcesso' | 'escalaSimulador' | 'margemPrazoMin';

const formDe = (c: TipoConfiguracao): Form => ({
  driver: c.driver,
  ip: c.ip,
  rack: String(c.rack),
  slot: String(c.slot),
  numeroDb: String(c.numeroDb),
  numeroDbProcesso: c.numeroDbProcesso === null ? '' : String(c.numeroDbProcesso),
  escalaSimulador: String(c.escalaSimulador),
  margemPrazoMin: String(c.margemPrazoMin),
});

const corpoDe = (f: Form) => ({
  driver: f.driver,
  ip: f.ip.trim(),
  rack: numeroDe(f.rack),
  slot: numeroDe(f.slot),
  numeroDb: numeroDe(f.numeroDb),
  numeroDbProcesso: f.numeroDbProcesso.trim() === '' ? null : numeroDe(f.numeroDbProcesso),
  escalaSimulador: numeroDe(f.escalaSimulador),
  margemPrazoMin: numeroDe(f.margemPrazoMin),
});

const CAMPOS = ['driver', 'ip', 'rack', 'slot', 'numeroDb', 'numeroDbProcesso', 'escalaSimulador', 'margemPrazoMin'];

export function Configuracao() {
  const { t } = useIdioma();
  const { dados, erro, recarregar } = useDados<TipoConfiguracao>('/api/admin/configuracao', ['reiniciado']);
  const gateway = useDados<SaudeGateway>('/api/admin/gateway', ['configuracao'], 3000);
  const [form, setForm] = useState<Form | null>(null);
  const acao = useAcao();
  const reinicio = useAcao();
  const [achados, setAchados] = useState<{ mes: number | null; processo: number | null } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    // só na primeira carga: uma recarga (aviso do servidor, conexão que voltou) não apaga o que está sendo digitado
    if (dados) setForm((f) => f ?? formDe(dados));
  }, [dados]);

  if (!form) return erro ? <FalhaAoCarregar erro={erro} tentar={recarregar} /> : <Carregando />;

  const numeroCampo = (k: CampoNumerico, rotulo: string, dica?: string) => (
    <Entrada
      rotulo={rotulo}
      type="number"
      inputMode="decimal"
      step="any"
      value={form[k]}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      dica={dica}
      erro={erroDoCampo(acao.erro, k, t)}
    />
  );

  const salvar = () =>
    acao.executar('salvar', async () => {
      await api('/api/admin/configuracao', { metodo: 'PUT', corpo: corpoDe(form) });
      await recarregar();
      return t.configuracao.salvo;
    });

  const procurar = () =>
    acao.executar('procurar', async () => {
      setAchados(null);
      const r = await api<{ mes: number | null; processo: number | null }>('/api/admin/procurar-db', { corpo: corpoDe(form) });
      setAchados(r);
      // sobre o formulário de agora: a busca demora, e o que foi digitado enquanto isso continua valendo
      setForm((f) => f && { ...f, numeroDb: r.mes === null ? f.numeroDb : String(r.mes), numeroDbProcesso: r.processo === null ? f.numeroDbProcesso : String(r.processo) });
    });

  const s7 = form.driver === 's7';
  return (
    <Pagina titulo={t.configuracao.titulo} subtitulo={t.configuracao.texto}>
      <Cartao>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="campos largos">
            <Selecao rotulo={t.configuracao.driver} value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value as Form['driver'] })} erro={erroDoCampo(acao.erro, 'driver', t)}>
              <option value="simulado">{t.bancada.drivers.simulado}</option>
              <option value="s7">{t.bancada.drivers.s7}</option>
            </Selecao>
            {s7 ? (
              <>
                <Entrada rotulo={t.configuracao.ip} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} inputMode="decimal" erro={erroDoCampo(acao.erro, 'ip', t)} />
                {numeroCampo('rack', t.configuracao.rack)}
                {numeroCampo('slot', t.configuracao.slot)}
                {numeroCampo('numeroDb', t.configuracao.numeroDb)}
                {numeroCampo('numeroDbProcesso', t.configuracao.numeroDbProcesso, t.configuracao.numeroDbProcessoDica)}
              </>
            ) : (
              numeroCampo('escalaSimulador', t.configuracao.escala, t.configuracao.escalaDica)
            )}
            {numeroCampo('margemPrazoMin', t.configuracao.margem, t.configuracao.margemDica)}
          </div>
          {s7 && <Aviso tom="atencao">{t.configuracao.avisoPutGet}</Aviso>}
          <MensagemErro erro={acao.erro} campos={CAMPOS} />
          {achados && (
            <Aviso tom="info">
              {t.configuracao.encontrados}: DB MES = {achados.mes ?? t.configuracao.naoEncontrado} · DB MB_Simulador = {achados.processo ?? t.configuracao.naoEncontrado}
            </Aviso>
          )}
          <div className="linha">
            <Botao type="submit" variante="primario" icone="certo" ocupado={acao.ocupado === 'salvar'}>
              {t.comum.salvar}
            </Botao>
            {s7 && (
              <Botao ocupado={acao.ocupado === 'procurar'} onClick={procurar}>
                {t.configuracao.procurar}
              </Botao>
            )}
          </div>
        </form>
      </Cartao>

      <Cartao titulo={t.configuracao.gateway}>
        {gateway.dados && !gateway.erro ? (
          <div className="linha">
            <Selo tom={gateway.dados.conectado ? 'ok' : 'ruim'}>{gateway.dados.conectado ? t.bancada.conectado : t.bancada.desconectado}</Selo>
            {gateway.dados.conectado && (
              <Selo tom={gateway.dados.assinaturaOk ? 'ok' : 'ruim'}>{gateway.dados.assinaturaOk ? t.configuracao.assinaturaOk : t.configuracao.assinaturaRuim}</Selo>
            )}
            <Selo tom="neutro">{t.bancada.drivers[gateway.dados.driver] ?? gateway.dados.driver}</Selo>
            {gateway.dados.erro && <span className="suave pequeno">{gateway.dados.erro}</span>}
          </div>
        ) : gateway.erro ? (
          <MensagemErro erro={gateway.erro} />
        ) : (
          <Carregando />
        )}
      </Cartao>

      <Cartao titulo={t.configuracao.reiniciar} className="perigo">
        <p className="suave">{t.configuracao.reiniciarTexto}</p>
        <MensagemErro erro={reinicio.erro} />
        <Botao variante="perigo" icone="repetir" onClick={() => setConfirmando(true)}>
          {t.configuracao.reiniciar}
        </Botao>
      </Cartao>
      <Confirmacao
        aberto={confirmando}
        titulo={`${t.configuracao.reiniciar}?`}
        texto={t.configuracao.reiniciarConfirma}
        confirmar={t.configuracao.reiniciar}
        perigo
        ocupado={reinicio.ocupado === 'reiniciar'}
        aoConfirmar={async () => {
          await reinicio.executar('reiniciar', async () => {
            await api('/api/admin/reiniciar', { corpo: {} });
            return t.configuracao.reiniciado;
          });
          setConfirmando(false);
        }}
        aoFechar={() => setConfirmando(false)}
      />
    </Pagina>
  );
}
