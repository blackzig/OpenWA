# Envio em massa: mensagens individuais e variações

Esta interface acrescenta dois modos de composição ao modo de mensagem única existente.

## 1. Uma mensagem para todos

Mantém o funcionamento anterior do OpenWA 0.25.0, incluindo texto/anexos, lista de destinatários e campo opcional de intervalo. Quando o intervalo fica vazio, o hotfix do cliente sorteia uma pausa de 0 a 5 minutos entre mensagens.

## 2. Mensagem por número

Permite cadastrar número e mensagem manualmente ou importar um CSV UTF-8 com cabeçalhos **numero** e **mensagem**. O separador pode ser ponto e vírgula, vírgula ou tabulação; campos entre aspas podem conter pontuação e quebras de linha.

```csv
numero;mensagem
5511999990001;"Olá, Ana! Seu pedido está pronto."
5511999990002;"Bom dia, Carlos! Sua entrega saiu para transporte."
```

Opcionalmente, pode haver outras colunas, desde que cada linha tenha todas as colunas declaradas no cabeçalho. O painel só usa o número e o texto da mensagem. Não concatena colunas nem completa uma mensagem vazia com a anterior.

A prévia exibe a correspondência exata entre número e mensagem que será enviada. Linhas vazias, telefone malformado, texto vazio, números repetidos e mais de 100 destinatários impedem o envio.

## 3. Mensagens aleatórias

Escreva pelo menos **duas alternativas diferentes**, com até 4.096 caracteres por mensagem. O painel embaralha as alternativas em ciclos: cada alternativa é utilizada uma vez por ciclo, evitando a mesma mensagem em dois destinatários consecutivos. A distribuição definida aparece na prévia antes de clicar em Enviar.

O comando **Salvar neste navegador** grava as alternativas no armazenamento local desse navegador. Elas **não** são compartilhadas entre computadores nem ficam no banco de dados do OpenWA. Evite cadastrar dados pessoais sensíveis ou credenciais. **Apagar salvas** elimina essa cópia local sem limpar os textos que estejam abertos no formulário.

## Compatibilidade e limites

- As duas modalidades novas enviam **texto**, utilizando o endpoint `send-bulk` que já aceita conteúdos diferentes por destinatário. Anexos continuam no modo original.
- O limite de lote é de **100 mensagens**. O limite do arquivo CSV é **2 MiB**. Há até **30 variações**.
- O intervalo entre envios segue configurado no lote no backend, **0–5 minutos aleatórios** quando o campo está vazio. O contador continua ligado ao horário real programado.
- A confirmação de lote aceito não é confirmação de entrega ou leitura pelo destinatário.
- Este mecanismo não é um recurso para contornar controles de spam. Use somente números com autorização para receber essas mensagens e respeite as políticas do WhatsApp.
- Uma atualização do painel deve ocorrer apenas após compilação/testes, sem lotes em andamento, com backup e reversão. Não reiniciar Cloudflare ou WSL durante acesso remoto.
