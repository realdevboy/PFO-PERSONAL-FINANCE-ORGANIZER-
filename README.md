# PFO

Organizador financeiro pessoal em português para pessoas com renda fixa, variável ou uma combinação das duas.

## O que funciona neste MVP

- Registrar várias fontes de renda fixa ou variável.
- Repetir uma renda fixa mensalmente pelos próximos 12 meses, com os próximos recebimentos marcados como previstos.
- Registrar despesas pagas e contas futuras, e marcar contas como pagas.
- Ver saldo disponível, entradas, gastos, contas previstas e gastos por categoria.
- Criar metas, adicionar novos valores guardados e acompanhar o progresso.
- Preencher um perfil financeiro com regime de trabalho, renda mensal de referência e gastos pessoais adicionados individualmente; o PFO sugere categorias pela descrição, agrupa os valores e permite editar valores e categorias.
- Consultar a margem mensal estimada no perfil e na visão geral, sem misturá-la ao saldo real ou duplicar lançamentos.
- Informar renda bruta e receber estimativas de INSS/IRRF, 13º e férias para regimes selecionados; para trabalho autônomo e MEI, ver contribuições e reservas de planejamento apropriadas ao regime.
- Adicionar várias fontes extras, como freelas e comissões, ou benefícios como vale-refeição e vale-transporte. Valores podem ser mensais ou por dia útil; os benefícios aparecem em separado e não são tratados como dinheiro disponível.
- Programar no painel a renda líquida estimada do perfil para o dia de pagamento informado; o recebimento fica previsto até a pessoa confirmar que recebeu.
- Para MEI, autônomos e situações compatíveis, registrar pagamentos adicionais previstos em contrato, como um valor equivalente ao 13º ou um adicional de férias; escolher percentual, base de cálculo e data para visualizar esses recebimentos futuros.
- Navegar entre meses e informar o saldo que havia nas contas no início de cada mês.
- Usar a interface em celular ou computador.

## Como abrir

Abra `index.html` em um navegador moderno. Para servir localmente:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Dados e privacidade

Esta versão não tem servidor, login ou conexão bancária. Os registros e o perfil financeiro ficam no `localStorage` do navegador neste dispositivo. A sugestão de categoria das despesas do perfil é feita localmente por palavras-chave na descrição, sem envio de dados para um serviço externo, e pode ser ajustada manualmente. Limpar os dados do navegador pode apagar as informações. Os valores do perfil são referências informadas pela pessoa usuária; para acompanhar o saldo real, registre recebimentos e despesas nas respectivas áreas. Não use dados financeiros reais até decidir e implementar uma estratégia de armazenamento e backup adequada.

## Estimativas de remuneração

As simulações usam tabelas de 2026 e são referências de planejamento. Para CLT, o PFO estima INSS progressivo, IRRF, 13º proporcional e férias com adicional de 1/3. Para RPPS federal usa a tabela da União; para RPPS estadual ou municipal, o usuário informa o desconto mensal do contracheque. Para autônomos, a modalidade de contribuição ao INSS é selecionável; para MEI, o DAS depende da atividade informada. Autônomos e MEI não recebem 13º ou férias como benefício trabalhista, então o app mostra valores equivalentes de reserva mensal. As contas não incluem todos os descontos, adicionais, convenções coletivas, custos do negócio ou ajustes anuais do IRPF.

Quando a pessoa ativa essa opção no perfil e informa o dia de pagamento, o PFO cria previsões mensais com a renda líquida estimada. Elas aparecem no painel e em Movimentações, mas só alteram o saldo disponível depois de serem marcadas como recebidas. Ao atualizar o perfil, previsões futuras criadas automaticamente são recalculadas; lançamentos confirmados e receitas lançadas manualmente são preservados.

Para pagamentos extras previstos em contrato, o usuário pode definir se o percentual será aplicado à renda estimada após descontos, à renda bruta ou a um valor mensal combinado, e informar a próxima data de pagamento. O PFO cria uma previsão anual em separado para cada valor ativo; ela aparece como planejada no painel e em Movimentações e só entra no saldo depois da confirmação do recebimento. O valor é uma estimativa conforme os termos informados e não inclui novos cálculos de impostos ou descontos. O recurso organiza pagamentos declarados pela pessoa usuária; não presume que todo MEI ou PJ tenha 13º, férias ou vínculo de emprego.

No perfil, freelas, comissões e outras rendas em dinheiro podem ser adicionados em linhas separadas e entram na renda variável de referência. Vale-refeição, vale-transporte e outros benefícios também podem ser informados por mês ou por dia útil. Para valores por dia útil, o PFO conta os dias de segunda a sexta do mês selecionado. O usuário pode informar o início e o fim das férias para retirar os dias úteis desse período das estimativas e previsões de renda. Feriados não são contabilizados; benefícios seguem separados da renda líquida e da margem disponível.

Referências oficiais: [tabela de contribuição do INSS 2026](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/), [tabelas de IRPF 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026), [DAS-MEI 2026](https://www8.receita.fazenda.gov.br/SimplesNacional/Noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3), [direitos trabalhistas de férias e 13º](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/proteja/duvidas-frequentes).

## Limites desta versão

- Não sincroniza dados entre dispositivos.
- Não importa transações bancárias.
- As rendas fixas recorrentes são geradas para 12 meses a partir da data escolhida.
- Este organizador não fornece recomendação de investimento nem aconselhamento financeiro.

