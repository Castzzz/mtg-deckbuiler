# Próximos passos

Lista do que ficou pra depois. Quando fizer um item, apague daqui.

## Ideias de funcionalidade

- **Arte personalizada (proxy)**: deixar a pessoa colocar a própria arte numa carta do deck, como se fosse um proxy.
  Dá pra estender o campo `artes` do deck (hoje guarda a impressão escolhida da Scryfall) pra aceitar uma imagem enviada.
  Precisa decidir onde guardar as imagens (servidor ou só no navegador).
- **Recuperar senha**: precisa de um serviço de e-mail pra mandar o link.

## Antes de hospedar num servidor

- **Salas de jogo** (`/jogar`) ficam na memória da API: somem se ela reiniciar e não funcionam com mais de um processo.
- **Bloqueio de força bruta do login** também é em memória (a tabela `tentativas_login` citada no guia antigo não existe).
  Com vários processos, cada um conta as tentativas separado.

## Coleta de dados

- A atualização roda todo dia às 04:00 por 2 horas (`deploy/systemd/mtg-atualizar.service`, `--minutos 120`),
  uns 3.200 decks por hora. Pra coletar mais, aumentar o `--minutos`.
- Não coletar do Moxfield: a API não é pública e os termos proíbem scraping.

## Como testar

- API: `.venv/bin/pytest`
- Front: `cd web && npm test` (Vitest) e `npx tsc -b`
- Navegador: `cd web && npm run e2e` (precisa do banco com os dados importados)
