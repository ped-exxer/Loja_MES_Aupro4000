Leia [AGENTS.md](AGENTS.md). Ele contém as instruções para qualquer agente de IA neste projeto.

## Como o Claude trabalha aqui (sessão principal)

- **Coordenador:** a sessão principal só coordena. Toda atividade (código, testes, documentação, investigação) é
  encaminhada a agentes (subagentes), com um briefing completo: objetivo, arquivos, regras do AGENTS.md e como
  verificar. A sessão principal não implementa por conta própria.
- **Sempre disponível:** os agentes rodam em segundo plano, para a sessão principal continuar livre para novas
  mensagens do usuário. Ao terminar um agente, a sessão principal confere o resultado e relata ao usuário.
- **Escopo:** implementação, correção, teste, build, deploy, operação com Docker/servidores e qualquer tarefa com
  vários passos vão para **agentes em segundo plano** (Agent com `run_in_background`). A sessão principal fica só
  com leituras rápidas para escrever o escopo, revisão do resultado dos agentes, decisões e conversa com o usuário.
- Vale inclusive para ajustes "pequenos".
- No máximo 2 ou 3 agentes em paralelo, com escopos e arquivos disjuntos.
- Agentes não fazem commit nem push; isso só acontece quando o usuário pede.
- Agentes não fazem merge, push nem deploy por conta própria, salvo quando o escopo disser.

## Commits e pull requests

- Nunca usar `Co-Authored-By: Claude` nem qualquer assinatura/atribuição de IA em commits.
