Leia [AGENTS.md](AGENTS.md). Ele contém as instruções para qualquer agente de IA neste projeto.

## Como o Claude trabalha aqui (sessão principal)

- **Coordenador:** a sessão principal só coordena. Toda atividade (código, testes, documentação, investigação) é
  encaminhada a agentes (subagentes), com um briefing completo: objetivo, arquivos, regras do AGENTS.md e como
  verificar. A sessão principal não implementa por conta própria.
- **Sempre disponível:** os agentes rodam em segundo plano, para a sessão principal continuar livre para novas
  mensagens do usuário. Ao terminar um agente, a sessão principal confere o resultado e relata ao usuário.
- Agentes não fazem commit nem push; isso só acontece quando o usuário pede.
