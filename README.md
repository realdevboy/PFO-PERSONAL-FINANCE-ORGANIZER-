# PFO

Organizador financeiro pessoal em português para pessoas com renda fixa, variável ou uma combinação das duas.

## O que funciona neste MVP

- Registrar várias fontes de renda fixa ou variável.
- Repetir uma renda fixa mensalmente pelos próximos 12 meses, com os próximos recebimentos marcados como previstos.
- Registrar despesas pagas e contas futuras, e marcar contas como pagas.
- Ver saldo disponível, entradas, gastos, contas previstas e gastos por categoria.
- Criar metas, adicionar novos valores guardados e acompanhar o progresso.
- Preencher um perfil financeiro com regime de trabalho, renda mensal de referência e gastos pessoais por categoria.
- Consultar a margem mensal estimada no perfil e na visão geral, sem misturá-la ao saldo real ou duplicar lançamentos.
- Navegar entre meses e informar o saldo que havia nas contas no início de cada mês.
- Usar a interface em celular ou computador.

## Como abrir

Abra `index.html` em um navegador moderno. Para servir localmente:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Dados e privacidade

Esta versão não tem servidor, login ou conexão bancária. Os registros e o perfil financeiro ficam no `localStorage` do navegador neste dispositivo. Limpar os dados do navegador pode apagar as informações. Os valores do perfil são referências informadas pela pessoa usuária; para acompanhar o saldo real, registre recebimentos e despesas nas respectivas áreas. Não use dados financeiros reais até decidir e implementar uma estratégia de armazenamento e backup adequada.

## Limites desta versão

- Não sincroniza dados entre dispositivos.
- Não importa transações bancárias.
- As rendas fixas recorrentes são geradas para 12 meses a partir da data escolhida.
- Este organizador não fornece recomendação de investimento nem aconselhamento financeiro.

