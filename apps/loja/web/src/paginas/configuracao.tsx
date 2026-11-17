// Configuração da Loja: catálogo e "Reiniciar a aula" (apaga os dados da Loja e pede ao MES que apague os dele).
// A configuração da bancada (driver, CPU, DB) é do MES, na tela dele.

import { useState } from 'react';
import { Cartao, MensagemErro, api } from '@aupro/interface';
import { useIdioma } from '../i18n/index.ts';
import { Catalogo } from './erp.tsx';

export function Configuracao() {
  const { t } = useIdioma();
  const [erro, setErro] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function reiniciar() {
    if (!confirm(t.configuracao.reiniciarConfirma)) return;
    setErro(null);
    setAviso(null);
    try {
      await api('/api/admin/reiniciar', { corpo: {} });
      setAviso(t.configuracao.reiniciado);
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <>
      <Catalogo />
      <Cartao titulo={t.configuracao.reiniciar}>
        <p className="suave">{t.configuracao.reiniciarTexto}</p>
        <MensagemErro erro={erro} />
        {aviso && <div className="aviso aviso-ok">{aviso}</div>}
        <button className="perigo" onClick={reiniciar}>
          {t.configuracao.reiniciar}
        </button>
      </Cartao>
    </>
  );
}
