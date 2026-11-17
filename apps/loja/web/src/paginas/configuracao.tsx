// Configuração da Loja: catálogo e "Reiniciar a aula" (apaga os dados da Loja e pede ao MES que apague os dele).
// A configuração da bancada (driver, CPU, DB) é do MES, na tela dele.

import { useState } from 'react';
import { Botao, Cartao, Confirmacao, MensagemErro, Pagina, api, useAcao } from '@aupro/interface';
import { useIdioma } from '../i18n/index.ts';
import { Catalogo } from './erp.tsx';

export function Configuracao() {
  const { t } = useIdioma();
  const acao = useAcao();
  const [confirmando, setConfirmando] = useState(false);

  async function reiniciar() {
    await acao.executar('reiniciar', async () => {
      await api('/api/admin/reiniciar', { corpo: {} });
      return t.configuracao.reiniciado;
    });
    setConfirmando(false);
  }

  return (
    <Pagina titulo={t.configuracao.titulo}>
      <Catalogo />
      <Cartao titulo={t.configuracao.reiniciar} className="perigo">
        <p className="suave">{t.configuracao.reiniciarTexto}</p>
        <MensagemErro erro={acao.erro} />
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
        ocupado={acao.ocupado === 'reiniciar'}
        aoConfirmar={reiniciar}
        aoFechar={() => setConfirmando(false)}
      />
    </Pagina>
  );
}
