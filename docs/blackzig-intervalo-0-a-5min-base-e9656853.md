# BlackZig – intervalo aleatório até 5 minutos

## Base técnica

Customização sobre o commit upstream **`e9656853d0706eede3aae3fa73315d2a9e5dcc73`**
(mais recente que a tag v0.24.0, apesar de package.json ainda declarar 0.24.0).
Esta branch é uma adaptação específica à base indicada, **não um upgrade** do OpenWA
e não altera outras instalações.

## Alteração

- O campo `delayBetweenMessages` aceita de 1000 até 300000 ms como teto configurado.
- `randomizeFullRange: true` sorteia **cada** intervalo de zero até esse teto (inclusive).
- Se o teto não vier na API e o novo modo estiver ligado, o padrão será 300000 ms.
- O campo aparece no Testador de Mensagens com opção separada, em todos os idiomas.
- O comportamento legado permanece por padrão quando a opção é omitida.
- Os valores já gravados em lotes antigos continuam utilizáveis.

Exemplo de opções para a API:

```json
{
  "options": {
    "delayBetweenMessages": 300000,
    "randomizeFullRange": true
  }
}
```

## Validação antes de implantar

As verificações executadas pelo GitHub Actions usam o código da branch, **não**
a instalação em andamento do cliente. Somente realizar implantação após:

1. Confirmar o HEAD e salvar `git diff` local (incluindo alterações de Vite).
2. Identificar o comando que inicia os serviços e como os dados persistem.
3. Fazer backup da instalação e dos dados, inclusive credenciais, em local privado.
4. Copiar a versão compilada para **pasta/portas de teste separadas**.
5. Verificar UI, API, configuração de tempo, cancelamento e observabilidade.
6. Obter autorização antes de qualquer parada/reinício no cliente.

## Limites e segurança

A mudança se aplica apenas ao intervalo **dentro de um mesmo lote**;
não oferece limite global entre lotes e não elimina o risco de restrição do WhatsApp.
Não executar disparos para números sem consentimento. Nunca publicar arquivos
`.env`, dados de sessão ou chaves de API em repositórios públicos.
