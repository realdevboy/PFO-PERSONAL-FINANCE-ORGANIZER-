(() => {
  const STORAGE_KEY = 'em-ordem-financas-v1';
  const categories = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Compras', 'Outros'];
  const today = new Date();
  let selectedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let toastTimer;

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && Array.isArray(stored.entries) && Array.isArray(stored.goals)) {
        return { entries: stored.entries, goals: stored.goals, openingBalances: stored.openingBalances || {}, profile: stored.profile || {} };
      }
    } catch (error) {
      console.warn('Não foi possível ler os dados locais.', error);
    }
    return { entries: [], goals: [], openingBalances: {}, profile: {} };
  }

  const state = loadState();
  state.profile = { ...(state.profile || {}) };
  if (state.profile.grossFixedIncome == null && state.profile.grossVariableIncome == null && (Number(state.profile.fixedIncome) > 0 || Number(state.profile.variableIncome) > 0)) {
    state.profile.legacyNetIncome = { fixed: Number(state.profile.fixedIncome) || 0, variable: Number(state.profile.variableIncome) || 0 };
  }
  delete state.profile.fixedIncome;
  delete state.profile.variableIncome;
  if (state.profile.workRegime === 'employee') state.profile.workRegime = 'clt';
  if (state.profile.workRegime === 'business-owner') state.profile.workRegime = 'mei';
  let activeGoalId = null;
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const dateFromInput = value => new Date(`${value}T12:00:00`);
  const dateLabel = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(dateFromInput(value)).replace('.', '');
  const dateInputValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const monthEntries = () => state.entries.filter(item => item.date?.slice(0, 7) === monthKey(selectedMonth));
  const openingBalance = () => Number(state.openingBalances[monthKey(selectedMonth)]) || 0;
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function updateMonthLabel() {
    const value = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selectedMonth);
    document.getElementById('month-label').textContent = value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
    document.getElementById('summary-period').textContent = value;
  }

  function statusText(item) {
    if (item.type === 'income') return item.status === 'received' ? 'Recebida' : 'Prevista';
    return item.status === 'paid' ? 'Paga' : 'A pagar';
  }

  function entryTitle(item) {
    return item.description || (item.type === 'income' ? 'Receita' : 'Despesa');
  }

  function renderOverview() {
    const entries = monthEntries();
    const received = entries.filter(item => item.type === 'income' && item.status === 'received');
    const paid = entries.filter(item => item.type !== 'income' && item.status === 'paid');
    const pendingBills = entries.filter(item => item.type === 'bill' && item.status !== 'paid');
    const receivedTotal = received.reduce((sum, item) => sum + Number(item.amount), 0);
    const paidTotal = paid.reduce((sum, item) => sum + Number(item.amount), 0);
    const pendingTotal = pendingBills.reduce((sum, item) => sum + Number(item.amount), 0);
    const savedForGoals = state.goals.reduce((sum, goal) => sum + Number(goal.saved || 0), 0);
    const cashBalance = openingBalance() + receivedTotal - paidTotal;
    const available = cashBalance - pendingTotal - savedForGoals;

    document.getElementById('available-value').textContent = money(available);
    document.getElementById('balance-explain').textContent = `${money(cashBalance)} em contas − ${money(pendingTotal)} em contas previstas − ${money(savedForGoals)} reservados para metas.`;
    document.getElementById('income-total').textContent = money(receivedTotal);
    document.getElementById('expense-total').textContent = money(paidTotal);
    document.getElementById('bills-total').textContent = money(pendingTotal);

    const byCategory = new Map();
    paid.forEach(item => byCategory.set(item.category || 'Outros', (byCategory.get(item.category || 'Outros') || 0) + Number(item.amount)));
    const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const categoryRoot = document.getElementById('category-breakdown');
    if (!categoryRows.length) {
      categoryRoot.innerHTML = '<div class="category-empty">Seus gastos por categoria aparecerão aqui quando você registrar despesas pagas.</div>';
    } else {
      const maxValue = categoryRows[0][1] || 1;
      categoryRoot.innerHTML = categoryRows.slice(0, 6).map(([name, amount]) => `
        <div class="category-item"><span class="category-label">${escapeHTML(name)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${Math.max(4, amount / maxValue * 100)}%"></div></div><strong class="category-value">${money(amount)}</strong></div>`).join('');
    }

    const upcoming = [...pendingBills].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const upcomingRoot = document.getElementById('upcoming-list');
    upcomingRoot.innerHTML = upcoming.length ? upcoming.map(item => `
      <div class="compact-item"><div><div class="item-primary">${escapeHTML(entryTitle(item))}</div><div class="item-secondary">${dateLabel(item.date)} · ${escapeHTML(item.category || 'Outros')}</div></div><strong class="item-value">${money(item.amount)}</strong></div>`).join('') : '<div class="empty-state">Nenhuma conta prevista neste mês.</div>';

    const incomeGroups = new Map();
    entries.filter(item => item.type === 'income').forEach(item => {
      const key = `${item.description}|${item.incomeType || 'variable'}`;
      const current = incomeGroups.get(key) || { description: item.description, incomeType: item.incomeType || 'variable', amount: 0, pending: 0 };
      current.amount += Number(item.amount);
      if (item.status !== 'received') current.pending += Number(item.amount);
      incomeGroups.set(key, current);
    });
    const incomeRoot = document.getElementById('income-sources');
    const incomeRows = [...incomeGroups.values()].sort((a, b) => b.amount - a.amount);
    incomeRoot.innerHTML = incomeRows.length ? incomeRows.slice(0, 4).map(item => `
      <div class="income-source"><div><span class="source-name">${escapeHTML(item.description)}</span><span class="source-type ${item.incomeType === 'variable' ? 'variable' : ''}">${item.incomeType === 'fixed' ? 'Fixa' : 'Variável'}</span><div class="item-secondary">${item.pending ? `${money(item.pending)} prevista` : 'Recebida no mês'}</div></div><strong class="source-total">${money(item.amount)}</strong></div>`).join('') : '<div class="empty-state">Adicione uma fonte de renda para acompanhar entradas fixas e variáveis.</div>';
  }

  const profileCategories = ['Moradia', 'Alimentação', 'Contas e serviços', 'Transporte', 'Saúde', 'Educação', 'Pessoais e lazer', 'Outros'];
  const workRegimes = {
    clt: 'Empregado(a) CLT',
    'public-federal': 'Servidor(a) público(a) federal — RPPS da União',
    'public-local': 'Servidor(a) estadual ou municipal',
    'self-employed': 'Autônomo(a) / freelancer',
    mei: 'Microempreendedor(a) individual — MEI',
    mixed: 'Renda de mais de um regime',
    other: 'Outro / em transição'
  };

  const TAX_YEAR = 2026;
  const MINIMUM_WAGE = 1621;
  const INSS_CEILING = 8475.55;
  const employeeInssBands = [
    { limit: 1621, rate: 0.075 }, { limit: 2902.84, rate: 0.09 },
    { limit: 4354.27, rate: 0.12 }, { limit: INSS_CEILING, rate: 0.14 }
  ];
  const federalRppsBands = [
    { limit: 1621, rate: 0.075 }, { limit: 2902.84, rate: 0.09 },
    { limit: 4354.27, rate: 0.12 }, { limit: 8475.55, rate: 0.14 },
    { limit: 14514.30, rate: 0.145 }, { limit: 29028.57, rate: 0.165 },
    { limit: 56605.73, rate: 0.19 }, { limit: Infinity, rate: 0.22 }
  ];
  const irrfBands = [
    { limit: 2428.80, rate: 0, deduction: 0 }, { limit: 2826.65, rate: 0.075, deduction: 182.16 },
    { limit: 3751.05, rate: 0.15, deduction: 394.16 }, { limit: 4664.68, rate: 0.225, deduction: 675.49 },
    { limit: Infinity, rate: 0.275, deduction: 908.73 }
  ];

  const legacyExpenseCategories = {
    housing: ['Moradia', 'Valor informado anteriormente — moradia'],
    food: ['Alimentação', 'Valor informado anteriormente — alimentação'],
    bills: ['Contas e serviços', 'Valor informado anteriormente — contas e serviços'],
    transport: ['Transporte', 'Valor informado anteriormente — transporte'],
    healthEducation: ['Saúde', 'Valor informado anteriormente — saúde e educação'],
    personal: ['Pessoais e lazer', 'Valor informado anteriormente — pessoais e lazer'],
    other: ['Outros', 'Valor informado anteriormente — outros']
  };

  let profileExpenseDraft = Array.isArray(state.profile?.expenseItems)
    ? state.profile.expenseItems.map(item => ({ ...item, id: String(item.id || newId()), category: profileCategories.includes(item.category) ? item.category : 'Outros' }))
    : Object.entries(state.profile?.expenses || {}).filter(([, amount]) => Number(amount) > 0).map(([key, amount], index) => {
      const [category, description] = legacyExpenseCategories[key] || legacyExpenseCategories.other;
      return { id: `legacy-${index}`, description, amount: Number(amount), category, categorySource: 'manual' };
    });
  let editingProfileExpenseId = null;
  state.profile = { ...(state.profile || {}), expenseItems: profileExpenseDraft };
  delete state.profile.expenses;

  function classifyProfileExpense(description) {
    const text = String(description || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rules = [
      ['Moradia', /\b(aluguel|condominio|iptu|moradia|financiamento imobiliario|prestacao do imovel|seguro residencial)\b/],
      ['Alimentação', /\b(mercado|supermercado|feira|padaria|acougue|restaurante|lanchonete|almoco|jantar|ifood|delivery|alimentacao)\b/],
      ['Contas e serviços', /\b(agua|luz|energia|eletricidade|internet|telefone|celular|gas|streaming|assinatura|seguro do carro|seguro residencial)\b/],
      ['Transporte', /\b(uber|99|taxi|combustivel|gasolina|etanol|onibus|metro|estacionamento|pedagio|transporte|passagem)\b/],
      ['Saúde', /\b(farmacia|remedio|consulta|medico|saude|dentista|terapia|plano de saude|exame)\b/],
      ['Educação', /\b(escola|faculdade|curso|material escolar|educacao|idiomas|mensalidade escolar)\b/],
      ['Pessoais e lazer', /\b(cinema|viagem|lazer|academia|roupa|vestuario|beleza|cabeleireiro|barbearia|hobby|show|livro)\b/]
    ];
    return rules.find(([, pattern]) => pattern.test(text))?.[0] || 'Outros';
  }

  function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function progressiveContribution(amount, bands, ceiling = Infinity) {
    let remaining = Math.min(Math.max(0, Number(amount) || 0), ceiling);
    let lowerLimit = 0;
    let total = 0;
    for (const band of bands) {
      const taxable = Math.max(0, Math.min(remaining, band.limit) - lowerLimit);
      total += taxable * band.rate;
      lowerLimit = band.limit;
      if (remaining <= band.limit) break;
    }
    return roundMoney(total);
  }

  function calculateIrrf(grossIncome, pensionContribution, dependents) {
    const gross = Math.max(0, Number(grossIncome) || 0);
    const legalDeductions = Math.max(0, Number(pensionContribution) || 0) + Math.max(0, Number(dependents) || 0) * 189.59;
    const taxBase = Math.max(0, gross - Math.max(607.20, legalDeductions));
    const band = irrfBands.find(item => taxBase <= item.limit) || irrfBands[irrfBands.length - 1];
    const beforeReduction = Math.max(0, taxBase * band.rate - band.deduction);
    const reduction = gross <= 5000 ? 312.89 : gross <= 7350 ? Math.max(0, 978.62 - 0.133145 * gross) : 0;
    return roundMoney(Math.max(0, beforeReduction - Math.min(beforeReduction, reduction)));
  }

  function pensionForRegime(gross, regime, profile, fallbackGross = gross) {
    if (regime === 'clt') return progressiveContribution(gross, employeeInssBands, INSS_CEILING);
    if (regime === 'public-federal') return progressiveContribution(gross, federalRppsBands);
    if (regime === 'public-local') {
      const monthlyGross = Number(fallbackGross) || 0;
      const monthlyPension = Math.min(monthlyGross, Math.max(0, Number(profile.publicPension) || 0));
      return monthlyGross > 0 ? roundMoney(monthlyPension * Math.max(0, gross) / monthlyGross) : 0;
    }
    if (regime === 'self-employed') {
      const mode = profile.contributionMode || '20';
      if (mode === '11') return gross > 0 ? roundMoney(MINIMUM_WAGE * 0.11) : 0;
      if (mode === '20') return gross > 0 ? progressiveContribution(Math.max(MINIMUM_WAGE, gross), [{ limit: INSS_CEILING, rate: 0.20 }], INSS_CEILING) : 0;
    }
    return 0;
  }

  function calculatePayroll(gross, regime, profile) {
    const pension = pensionForRegime(gross, regime, profile);
    const irrf = calculateIrrf(gross, pension, profile.dependents);
    return { gross: roundMoney(gross), pension, irrf, net: roundMoney(gross - pension - irrf) };
  }

  function meiDas(activity) {
    const inss = roundMoney(MINIMUM_WAGE * (activity === 'haul' ? 0.12 : 0.05));
    const icms = activity === 'commerce' || activity === 'both' || activity === 'haul' ? 1 : 0;
    const iss = activity === 'service' || activity === 'both' ? 5 : 0;
    return { inss, icms, iss, total: roundMoney(inss + icms + iss) };
  }

  function calculateProfileIncome(profile) {
    const fixed = Math.max(0, Number(profile.grossFixedIncome) || 0);
    const variable = Math.max(0, Number(profile.grossVariableIncome) || 0);
    const gross = fixed + variable;
    const dependents = Number(profile.dependents) || 0;
    const regime = profile.workRegime || 'clt';
    const months = Math.min(12, Math.max(1, Number(profile.monthsWorked) || 12));
    let pension = 0;
    let irrf = 0;
    let otherDeductions = 0;
    let net = gross;
    let employmentGross = 0;
    let independentGross = 0;
    let benefitRegime = null;
    let needsActivity = false;
    let notes = [];

    if (regime === 'clt' || regime === 'public-federal' || regime === 'public-local') {
      const payroll = calculatePayroll(gross, regime, profile);
      pension = payroll.pension;
      irrf = payroll.irrf;
      net = payroll.net;
      employmentGross = gross;
      benefitRegime = regime;
      if (regime === 'clt') notes.push('INSS progressivo e IRRF estimados pelas tabelas de 2026. Não inclui pensão alimentícia, plano de saúde, vale-transporte ou outros descontos do contracheque.');
      if (regime === 'public-federal') notes.push('Usa a tabela RPPS da União de 2026; não inclui Funpresp, adicionais ou descontos específicos do órgão.');
      if (regime === 'public-local') notes.push('O desconto RPPS varia por estado e município. Informe o valor mensal do contracheque; sem esse dado, o cálculo considera apenas o IRRF.');
    } else if (regime === 'self-employed') {
      pension = pensionForRegime(gross, regime, profile);
      irrf = calculateIrrf(gross, pension, dependents);
      net = roundMoney(gross - pension - irrf);
      independentGross = gross;
      notes.push('Estimativa do IRPF mensal sem despesas dedutíveis da atividade. A contribuição ao INSS depende do plano selecionado.');
    } else if (regime === 'mei') {
      if (gross > 0 && !profile.meiActivity) needsActivity = true;
      const das = profile.meiActivity ? meiDas(profile.meiActivity) : { inss: 0, icms: 0, iss: 0, total: 0 };
      pension = das.inss;
      otherDeductions = das.icms + das.iss;
      net = needsActivity ? 0 : roundMoney(gross - das.total);
      independentGross = gross;
      notes.push('Deduz o DAS-MEI de 2026 da receita bruta. Não desconta custos do negócio nem calcula IRPF sobre pró-labore ou lucro.');
    } else if (regime === 'mixed') {
      const variableRegime = profile.variableRegime || 'self-employed';
      const payroll = calculatePayroll(fixed, 'clt', profile);
      employmentGross = fixed + (variableRegime === 'clt' ? variable : 0);
      if (variableRegime === 'clt') {
        const combinedPayroll = calculatePayroll(employmentGross, 'clt', profile);
        pension = combinedPayroll.pension;
        irrf = combinedPayroll.irrf;
        net = combinedPayroll.net;
      } else if (variableRegime === 'self-employed') {
        const independent = calculatePayroll(variable, 'self-employed', profile);
        pension = payroll.pension + independent.pension;
        irrf = payroll.irrf + independent.irrf;
        net = payroll.net + independent.net;
        independentGross = variable;
      } else {
        if (variable > 0 && !profile.meiActivity) needsActivity = true;
        const das = profile.meiActivity ? meiDas(profile.meiActivity) : { inss: 0, icms: 0, iss: 0, total: 0 };
        pension = payroll.pension + das.inss;
        irrf = payroll.irrf;
        otherDeductions = das.icms + das.iss;
        net = needsActivity ? 0 : payroll.net + variable - das.total;
        independentGross = variable;
      }
      benefitRegime = 'clt';
      notes.push('No regime misto, a renda fixa é tratada como salário CLT e a renda variável conforme o tipo selecionado. A declaração anual pode ajustar impostos entre fontes pagadoras.');
    } else {
      otherDeductions = Math.min(gross, Math.max(0, Number(profile.otherDeductions) || 0));
      net = roundMoney(gross - otherDeductions);
      independentGross = gross;
      notes.push('Informe manualmente os descontos que conhece. O PFO não presume regras tributárias para este regime.');
    }

    let thirteenth = null;
    let vacation = null;
    if (benefitRegime && employmentGross > 0) {
      const thirteenthGross = roundMoney(employmentGross * months / 12);
      const thirteenthPension = pensionForRegime(thirteenthGross, benefitRegime, profile, employmentGross);
      const thirteenthIrrf = calculateIrrf(thirteenthGross, thirteenthPension, dependents);
      const vacationGross = roundMoney(employmentGross * months / 12 * (4 / 3));
      const vacationPension = pensionForRegime(vacationGross, benefitRegime, profile, employmentGross);
      const vacationIrrf = calculateIrrf(vacationGross, vacationPension, dependents);
      thirteenth = { gross: thirteenthGross, pension: thirteenthPension, irrf: thirteenthIrrf, net: roundMoney(thirteenthGross - thirteenthPension - thirteenthIrrf) };
      vacation = { gross: vacationGross, bonus: roundMoney(vacationGross / 4), pension: vacationPension, irrf: vacationIrrf, net: roundMoney(vacationGross - vacationPension - vacationIrrf) };
      notes.push('13º proporcional aos meses informados. Férias estimadas como remuneração proporcional mais 1/3 constitucional, sem abono pecuniário ou adicionais variáveis específicos.');
    }

    const reserves = independentGross > 0 ? {
      thirteenthMonthly: roundMoney(independentGross / 12),
      vacationMonthly: roundMoney(independentGross / 9)
    } : null;
    if (reserves) notes.push('Autônomos e MEI não recebem 13º ou férias como benefícios trabalhistas; os valores abaixo são reservas mensais opcionais para planejamento.');

    const legacy = profile.legacyNetIncome || {};
    const legacyNet = (Number(legacy.fixed) || 0) + (Number(legacy.variable) || 0);
    const hasGross = gross > 0;
    const monthlyNet = hasGross && !needsActivity ? roundMoney(net) : !hasGross && legacyNet > 0 ? legacyNet : null;
    return { gross: roundMoney(gross), pension: roundMoney(pension), irrf: roundMoney(irrf), otherDeductions: roundMoney(otherDeductions), monthlyNet, employmentGross, independentGross, thirteenth, vacation, reserves, notes, hasGross, legacyNet, regime, needsActivity };
  }

  function profileTotals(profile) {
    const calculation = calculateProfileIncome(profile);
    const monthlyExpenses = (profile.expenseItems || []).reduce((total, item) => total + (Number(item.amount) || 0), 0);
    const monthlyIncome = calculation.monthlyNet ?? 0;
    return { monthlyIncome, monthlyExpenses, estimatedMargin: monthlyIncome - monthlyExpenses, calculation };
  }

  function profileMetricsHTML(profile, compact = false) {
    const totals = profileTotals(profile);
    const marginLabel = totals.estimatedMargin < 0 ? 'Diferença estimada' : 'Margem estimada';
    const incomeLabel = totals.calculation.hasGross ? 'Renda após descontos' : totals.calculation.legacyNet > 0 ? 'Renda líquida anterior' : 'Renda estimada';
    const incomeValue = totals.calculation.needsActivity ? 'Selecione a atividade' : money(totals.monthlyIncome);
    const marginValue = totals.calculation.needsActivity ? 'Aguardando dados' : money(totals.estimatedMargin);
    return `<div class="profile-metric"><span>${incomeLabel}</span><strong>${incomeValue}</strong></div><div class="profile-metric"><span>Gastos pessoais</span><strong>${money(totals.monthlyExpenses)}</strong></div><div class="profile-metric ${!totals.calculation.needsActivity && totals.estimatedMargin < 0 ? 'profile-metric-negative' : ''}"><span>${marginLabel}</span><strong>${marginValue}</strong></div>${compact ? '' : `<p class="profile-calculation-note">${escapeHTML(profile.name ? `${profile.name}, esta é uma estimativa baseada nos valores informados.` : 'Estimativa baseada nos valores informados.')}</p>`}`;
  }

  function renderProfileOverview() {
    const root = document.getElementById('profile-overview');
    if (!root) return;
    if (!state.profile?.saved) {
      root.innerHTML = '<div class="profile-empty"><span>Complete o perfil com sua renda e seus gastos mensais de referência para ver uma estimativa aqui.</span><button class="text-button" data-go="profile">Preencher perfil <span aria-hidden="true">→</span></button></div>';
      return;
    }
    root.innerHTML = `<div class="profile-regime">${escapeHTML(workRegimes[state.profile.workRegime] || workRegimes.other)}${state.profile.name ? ` · ${escapeHTML(state.profile.name)}` : ''}</div><div class="profile-metrics">${profileMetricsHTML(state.profile, true)}</div><div class="profile-category-totals">${profileCategoryTotalsHTML(state.profile.expenseItems || [])}</div>`;
  }

  function profileFromForm(form) {
    const data = new FormData(form);
    const grossFixedIncome = Number(data.get('grossFixedIncome')) || 0;
    const grossVariableIncome = Number(data.get('grossVariableIncome')) || 0;
    return {
      saved: true,
      name: String(data.get('name') || '').trim(),
      workRegime: String(data.get('workRegime') || 'other'),
      grossFixedIncome,
      grossVariableIncome,
      legacyNetIncome: grossFixedIncome + grossVariableIncome > 0 ? null : state.profile.legacyNetIncome || null,
      monthsWorked: Number(data.get('monthsWorked')) || 12,
      dependents: Number(data.get('dependents')) || 0,
      variableRegime: String(data.get('variableRegime') || 'self-employed'),
      meiActivity: String(data.get('meiActivity') || ''),
      contributionMode: String(data.get('contributionMode') || '20'),
      publicPension: Number(data.get('publicPension')) || 0,
      otherDeductions: Number(data.get('otherDeductions')) || 0,
      expenseItems: profileExpenseDraft.map(item => ({ ...item }))
    };
  }

  function renderProfileForm() {
    const form = document.getElementById('profile-form');
    const profile = state.profile || {};
    form.elements.name.value = profile.name || '';
    form.elements.workRegime.value = profile.workRegime || 'clt';
    form.elements.grossFixedIncome.value = profile.grossFixedIncome ?? '';
    form.elements.grossVariableIncome.value = profile.grossVariableIncome ?? '';
    form.elements.monthsWorked.value = profile.monthsWorked ?? 12;
    form.elements.dependents.value = profile.dependents ?? 0;
    form.elements.variableRegime.value = profile.variableRegime || 'self-employed';
    form.elements.meiActivity.value = profile.meiActivity || '';
    form.elements.contributionMode.value = profile.contributionMode || '20';
    form.elements.publicPension.value = profile.publicPension ?? '';
    form.elements.otherDeductions.value = profile.otherDeductions ?? '';
    updateProfileRegimeFields();
    renderProfileExpenseList();
    renderProfileEstimate(profile.saved ? profile : profileFromForm(form));
  }

  function renderProfileEstimate(profile) {
    const legacyNote = document.getElementById('profile-legacy-income-note');
    const oldNet = (Number(profile.legacyNetIncome?.fixed) || 0) + (Number(profile.legacyNetIncome?.variable) || 0);
    if (oldNet > 0 && !(Number(profile.grossFixedIncome) || 0) && !(Number(profile.grossVariableIncome) || 0)) {
      legacyNote.textContent = `Sua renda de referência anterior (${money(oldNet)}) estava cadastrada como líquida. Informe o valor bruto para calcular os descontos corretamente; o valor anterior foi mantido como referência até lá.`;
      legacyNote.hidden = false;
    } else legacyNote.hidden = true;
    document.getElementById('profile-estimate').innerHTML = `<div class="profile-metrics">${profileMetricsHTML(profile)}</div>`;
    renderSalaryCalculation(profile);
    renderProfileExpenseSummary(profile.expenseItems || []);
  }

  function updateProfileRegimeFields() {
    const form = document.getElementById('profile-form');
    const regime = form.elements.workRegime.value;
    const variableRegime = form.elements.variableRegime.value;
    document.getElementById('mixed-income-note').hidden = regime !== 'mixed';
    document.getElementById('mixed-variable-field').hidden = regime !== 'mixed';
    document.getElementById('mei-activity-field').hidden = regime !== 'mei' && !(regime === 'mixed' && variableRegime === 'mei');
    document.getElementById('independent-contribution-field').hidden = regime !== 'self-employed' && !(regime === 'mixed' && variableRegime === 'self-employed');
    document.getElementById('public-pension-field').hidden = regime !== 'public-local';
    document.getElementById('other-deductions-field').hidden = regime !== 'other';
    const meiIncome = Number(form.elements.grossFixedIncome.value) + Number(form.elements.grossVariableIncome.value);
    form.elements.meiActivity.required = !document.getElementById('mei-activity-field').hidden && meiIncome > 0;
  }

  function renderSalaryCalculation(profile) {
    const root = document.getElementById('salary-calculation');
    const result = calculateProfileIncome(profile);
    if (result.needsActivity) {
      root.innerHTML = '<div class="salary-empty">Selecione a atividade do MEI para calcular o DAS e a renda após esse desconto.</div>';
      return;
    }
    if (!result.hasGross) {
      root.innerHTML = result.legacyNet > 0
        ? '<div class="salary-empty">Preencha a renda bruta para ver INSS, IRRF, 13º e férias. A renda líquida anterior continua sendo usada na estimativa de margem enquanto isso.</div>'
        : '<div class="salary-empty">Informe sua renda bruta para ver a estimativa dos descontos e benefícios aplicáveis ao regime escolhido.</div>';
      return;
    }
    const meiOnly = result.regime === 'mei';
    const contributionLabel = result.regime === 'public-federal' || result.regime === 'public-local' ? 'Previdência / RPPS' : 'INSS / contribuição previdenciária';
    const totalDeductions = roundMoney(result.pension + result.irrf + result.otherDeductions);
    const metrics = [
      ['Renda bruta mensal', money(result.gross)],
      [meiOnly ? 'DAS — parcela previdenciária' : contributionLabel, money(result.pension)],
      ['IRRF estimado', money(result.irrf)],
      ...(meiOnly || (result.regime === 'mixed' && profile.variableRegime === 'mei') ? [['DAS — ICMS/ISS', money(result.otherDeductions)]] : result.otherDeductions ? [['Outros descontos informados', money(result.otherDeductions)]] : []),
      ['Total descontado estimado', money(totalDeductions)],
      ['Renda após descontos estimados', money(result.monthlyNet)]
    ];
    const reserveMarkup = result.reserves ? `
      <div class="salary-reserve"><h3>Reserva mensal opcional — renda sem benefício trabalhista</h3><div><span>Para um 13º equivalente</span><strong>${money(result.reserves.thirteenthMonthly)}</strong></div><div><span>Para um mês de férias + 1/3</span><strong>${money(result.reserves.vacationMonthly)}</strong></div></div>` : '';
    const benefitMarkup = result.thirteenth && result.vacation ? `
      <div class="salary-benefit-grid">
        <article class="salary-benefit"><h3>13º salário estimado</h3><div><span>Bruto</span><strong>${money(result.thirteenth.gross)}</strong></div><div><span>INSS / previdência + IRRF</span><strong>${money(result.thirteenth.pension + result.thirteenth.irrf)}</strong></div><div><span>Líquido estimado</span><strong>${money(result.thirteenth.net)}</strong></div></article>
        <article class="salary-benefit"><h3>Férias + 1/3 estimadas</h3><div><span>Total bruto</span><strong>${money(result.vacation.gross)}</strong></div><div><span>Adicional de 1/3 incluído</span><strong>${money(result.vacation.bonus)}</strong></div><div><span>INSS / previdência + IRRF</span><strong>${money(result.vacation.pension + result.vacation.irrf)}</strong></div><div><span>Líquido estimado</span><strong>${money(result.vacation.net)}</strong></div></article>
      </div>${reserveMarkup}` : reserveMarkup;
    const notes = result.notes.map(note => `<p class="salary-note">${escapeHTML(note)}</p>`).join('');
    root.innerHTML = `<div class="salary-calculation-heading"><strong>Confira os descontos antes de salvar</strong><span>Prévia atualizada ao preencher · estimativa pelas regras de ${TAX_YEAR}</span></div><div class="salary-metrics">${metrics.map(([label, value], index) => `<div class="salary-metric ${label.startsWith('Total descontado') ? 'salary-metric-total' : ''} ${index === metrics.length - 1 ? 'salary-metric-net' : ''}"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>${benefitMarkup}${notes}`;
  }

  function profileCategoryTotalsHTML(items) {
    const totals = new Map();
    items.forEach(item => totals.set(item.category || 'Outros', (totals.get(item.category || 'Outros') || 0) + (Number(item.amount) || 0)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => `<span class="profile-category-total"><span>${escapeHTML(category)}</span><strong>${money(amount)}</strong></span>`).join('');
  }

  function renderProfileExpenseSummary(items) {
    const root = document.getElementById('profile-expense-summary');
    if (!root) return;
    const summary = profileCategoryTotalsHTML(items);
    root.innerHTML = summary || '<span class="profile-list-empty">As despesas adicionadas serão agrupadas aqui por categoria.</span>';
  }

  function renderProfileExpenseList() {
    const root = document.getElementById('profile-expense-list');
    if (!root) return;
    root.innerHTML = profileExpenseDraft.length ? profileExpenseDraft.map(item => `
      <article class="profile-expense-row">
        <div class="profile-expense-description"><strong>${escapeHTML(item.description)}</strong><span>${item.categorySource === 'auto' ? 'Categoria identificada pela descrição' : 'Categoria'}</span></div>
        <div class="profile-expense-value">${editingProfileExpenseId === item.id
          ? `<label class="sr-only" for="profile-expense-edit-${escapeHTML(item.id)}">Novo valor para ${escapeHTML(item.description)}</label><input class="profile-expense-value-input" id="profile-expense-edit-${escapeHTML(item.id)}" data-profile-expense-value="${escapeHTML(item.id)}" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(item.amount)}"><button class="small-action" type="button" data-save-profile-expense="${escapeHTML(item.id)}">Salvar</button><button class="small-action" type="button" data-cancel-profile-expense="${escapeHTML(item.id)}">Cancelar</button>`
          : `<strong class="profile-expense-amount">${money(item.amount)}</strong><button class="small-action" type="button" data-edit-profile-expense="${escapeHTML(item.id)}" aria-label="Editar valor de ${escapeHTML(item.description)}">Editar valor</button>`}</div>
        <label class="profile-expense-category"><span class="sr-only">Categoria para ${escapeHTML(item.description)}</span><select data-profile-category="${escapeHTML(item.id)}" aria-label="Categoria para ${escapeHTML(item.description)}">${profileCategories.map(category => `<option${item.category === category ? ' selected' : ''}>${category}</option>`).join('')}</select></label>
        <button class="small-action delete" type="button" data-remove-profile-expense="${escapeHTML(item.id)}" aria-label="Remover despesa ${escapeHTML(item.description)}">Remover</button>
      </article>`).join('') : '<div class="profile-list-empty">Você ainda não adicionou despesas.</div>';
  }

  function renderTransactions() {
    const filter = document.getElementById('transaction-filter').value;
    const entries = monthEntries().filter(item => filter === 'all' || item.type === filter || (filter === 'expense' && item.type !== 'income' && item.status === 'paid'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    document.getElementById('transaction-count').textContent = `${entries.length} ${entries.length === 1 ? 'item' : 'itens'}`;
    const root = document.getElementById('transaction-list');
    if (!entries.length) {
      root.innerHTML = '<div class="empty-state">Ainda não há lançamentos neste mês. Use “Novo lançamento” para adicionar sua primeira receita ou despesa.</div>';
      return;
    }
    root.innerHTML = entries.map(item => {
      const isIncome = item.type === 'income';
      const isPending = isIncome ? item.status !== 'received' : item.status !== 'paid';
      const label = isIncome ? (item.incomeType === 'fixed' ? 'Renda fixa' : 'Renda variável') : (item.category || 'Outros');
      const sign = isIncome ? '+' : '−';
      const amountClass = isIncome ? 'positive' : 'negative';
      const action = isPending ? `<button class="small-action" data-complete="${item.id}">${isIncome ? 'Marcar recebida' : 'Marcar paga'}</button>` : '';
      return `<div class="transaction-row"><div class="transaction-main"><div class="transaction-name">${escapeHTML(entryTitle(item))}</div><div class="transaction-meta">${dateLabel(item.date)} · ${escapeHTML(label)} <span class="status-tag ${isPending ? 'pending' : ''}">${statusText(item)}</span></div></div><strong class="transaction-amount ${amountClass}">${sign} ${money(item.amount)}</strong><div class="row-actions">${action}<button class="small-action delete" data-delete="${item.id}" aria-label="Excluir ${escapeHTML(entryTitle(item))}">Excluir</button></div></div>`;
    }).join('');
  }

  function renderPlanning() {
    const items = monthEntries().filter(item => item.type !== 'income').sort((a, b) => a.date.localeCompare(b.date));
    const pending = items.filter(item => item.status !== 'paid');
    const total = pending.reduce((sum, item) => sum + Number(item.amount), 0);
    document.getElementById('planning-total').textContent = money(total);
    document.getElementById('planning-count').textContent = `${pending.length} ${pending.length === 1 ? 'conta' : 'contas'}`;
    const root = document.getElementById('planning-list');
    if (!items.length) {
      root.innerHTML = '<div class="empty-state">Nenhuma conta cadastrada para este mês. Adicione aluguel, fatura ou outra despesa futura.</div>';
      return;
    }
    root.innerHTML = items.map(item => `<div class="transaction-row"><div class="transaction-main"><div class="transaction-name">${escapeHTML(entryTitle(item))}</div><div class="transaction-meta">Vence ${dateLabel(item.date)} · ${escapeHTML(item.category || 'Outros')} <span class="status-tag ${item.status !== 'paid' ? 'pending' : ''}">${statusText(item)}</span></div></div><strong class="transaction-amount negative">− ${money(item.amount)}</strong><div class="row-actions">${item.status !== 'paid' ? `<button class="small-action" data-complete="${item.id}">Marcar paga</button>` : ''}<button class="small-action delete" data-delete="${item.id}" aria-label="Excluir ${escapeHTML(entryTitle(item))}">Excluir</button></div></div>`).join('');
  }

  function renderGoals() {
    const root = document.getElementById('goals-list');
    if (!state.goals.length) {
      root.innerHTML = '<div class="panel empty-state">Ainda não há metas. Crie uma para acompanhar o valor guardado e o que falta para chegar ao objetivo.</div>';
      return;
    }
    root.innerHTML = state.goals.map(goal => {
      const percent = Math.min(100, Math.round(Number(goal.saved) / Number(goal.target) * 100));
      return `<article class="goal-card"><div class="goal-card-top"><span class="goal-icon" aria-hidden="true">◎</span><button class="goal-delete" data-delete-goal="${goal.id}" aria-label="Excluir meta ${escapeHTML(goal.name)}">Excluir</button></div><h2 class="goal-name">${escapeHTML(goal.name)}</h2><div class="goal-amounts"><span>Guardado <strong>${money(goal.saved)}</strong></span><span>Meta <strong>${money(goal.target)}</strong></span></div><div class="goal-progress" role="progressbar" aria-label="Progresso da meta ${escapeHTML(goal.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><div class="goal-percent">${percent}% concluído${Number(goal.saved) >= Number(goal.target) ? ' · Meta alcançada!' : ''}</div><button class="quiet-link" data-contribute="${goal.id}">＋ Guardar para esta meta</button></article>`;
    }).join('');
  }

  function renderAll() {
    updateMonthLabel();
    renderOverview();
    renderTransactions();
    renderPlanning();
    renderGoals();
    renderProfileOverview();
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function switchView(name) {
    document.querySelectorAll('.view').forEach(view => {
      const active = view.id === `view-${name}`;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    document.querySelectorAll('.nav-link[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openTransaction(kind = 'income') {
    const form = document.getElementById('transaction-form');
    form.reset();
    const defaultDate = monthKey(selectedMonth) === monthKey(today) ? today : selectedMonth;
    form.elements.date.value = dateInputValue(defaultDate);
    document.getElementById('entry-kind').value = kind;
    updateTransactionFields();
    document.getElementById('transaction-dialog').showModal();
    form.elements.description.focus();
  }

  function updateTransactionFields() {
    const kind = document.getElementById('entry-kind').value;
    const isIncome = kind === 'income';
    const isBill = kind === 'bill';
    const isFixedIncome = isIncome && document.getElementById('transaction-form').elements.incomeType.value === 'fixed';
    document.getElementById('income-type-field').hidden = !isIncome;
    document.getElementById('category-field').hidden = isIncome;
    document.getElementById('repeat-monthly-field').hidden = !isFixedIncome;
    if (!isFixedIncome) document.getElementById('transaction-form').elements.repeatMonthly.checked = false;
    const status = document.getElementById('transaction-form').elements.status;
    status.innerHTML = isIncome ? '<option value="received">Recebida</option><option value="planned">Prevista</option>' : (isBill ? '<option value="pending">A pagar</option><option value="paid">Paga</option>' : '<option value="paid">Paga</option>');
  }

  document.querySelectorAll('.nav-link[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  document.body.addEventListener('click', event => {
    const goButton = event.target.closest('[data-go]');
    if (goButton) switchView(goButton.dataset.go);
  });
  document.getElementById('prev-month').addEventListener('click', () => { selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1); renderAll(); });
  document.getElementById('next-month').addEventListener('click', () => { selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1); renderAll(); });
  document.getElementById('new-transaction').addEventListener('click', () => openTransaction('income'));
  document.querySelectorAll('[data-open-transaction]').forEach(button => button.addEventListener('click', () => openTransaction('income')));
  document.getElementById('add-income').addEventListener('click', () => openTransaction('income'));
  document.getElementById('new-bill').addEventListener('click', () => openTransaction('bill'));
  document.getElementById('entry-kind').addEventListener('change', updateTransactionFields);
  document.getElementById('transaction-form').elements.incomeType.addEventListener('change', updateTransactionFields);

  const profileForm = document.getElementById('profile-form');
  profileForm.addEventListener('input', () => renderProfileEstimate(profileFromForm(profileForm)));
  profileForm.addEventListener('change', () => {
    updateProfileRegimeFields();
    renderProfileEstimate(profileFromForm(profileForm));
  });
  document.getElementById('add-profile-expense').addEventListener('click', () => {
    const description = document.getElementById('profile-expense-description');
    const amount = document.getElementById('profile-expense-amount');
    const cleanDescription = description.value.trim();
    const numericAmount = Number(amount.value);
    if (!cleanDescription || !numericAmount || numericAmount < 0) {
      showToast('Informe a descrição e o valor mensal da despesa.');
      (!cleanDescription ? description : amount).focus();
      return;
    }
    profileExpenseDraft.push({ id: newId(), description: cleanDescription, amount: numericAmount, category: classifyProfileExpense(cleanDescription), categorySource: 'auto' });
    description.value = '';
    amount.value = '';
    renderProfileExpenseList();
    renderProfileEstimate(profileFromForm(profileForm));
    description.focus();
  });
  [document.getElementById('profile-expense-description'), document.getElementById('profile-expense-amount')].forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('add-profile-expense').click();
    }
  }));
  profileForm.addEventListener('submit', event => {
    event.preventDefault();
    state.profile = profileFromForm(event.currentTarget);
    save();
    renderProfileOverview();
    renderProfileEstimate(state.profile);
    showToast('Perfil salvo. A estimativa mensal foi atualizada.');
  });
  document.getElementById('transaction-filter').addEventListener('change', renderTransactions);

  document.getElementById('edit-opening-balance').addEventListener('click', () => {
    const form = document.getElementById('balance-form');
    form.elements.openingBalance.value = openingBalance().toFixed(2);
    document.getElementById('balance-dialog').showModal();
  });
  document.getElementById('balance-form').addEventListener('submit', event => {
    event.preventDefault();
    state.openingBalances[monthKey(selectedMonth)] = Number(event.currentTarget.elements.openingBalance.value) || 0;
    save();
    document.getElementById('balance-dialog').close();
    renderAll();
    showToast('Saldo inicial atualizado.');
  });

  document.getElementById('transaction-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const kind = form.elements.kind.value;
    const selectedStatus = form.elements.status.value;
    const entry = {
      id: newId(),
      type: kind,
      description: form.elements.description.value.trim(),
      amount: Number(form.elements.amount.value),
      date: form.elements.date.value,
      category: kind === 'income' ? '' : form.elements.category.value,
      incomeType: kind === 'income' ? form.elements.incomeType.value : '',
      status: kind === 'income' ? (selectedStatus === 'received' ? 'received' : 'planned') : (selectedStatus === 'paid' ? 'paid' : 'pending'),
      createdAt: Date.now()
    };
    state.entries.push(entry);
    if (kind === 'income' && entry.incomeType === 'fixed' && form.elements.repeatMonthly.checked) {
      const sourceDate = dateFromInput(entry.date);
      for (let offset = 1; offset < 12; offset += 1) {
        const year = sourceDate.getFullYear();
        const month = sourceDate.getMonth() + offset;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const nextDate = new Date(year, month, Math.min(sourceDate.getDate(), lastDay));
        state.entries.push({ ...entry, id: newId(), date: dateInputValue(nextDate), status: 'planned', createdAt: Date.now() + offset });
      }
    }
    save();
    document.getElementById('transaction-dialog').close();
    renderAll();
    showToast(kind === 'income' ? 'Receita adicionada.' : (kind === 'bill' ? 'Conta planejada.' : 'Despesa adicionada.'));
  });

  document.getElementById('new-goal').addEventListener('click', () => {
    const form = document.getElementById('goal-form');
    form.reset();
    form.elements.saved.value = '0';
    document.getElementById('goal-dialog').showModal();
  });
  document.getElementById('goal-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    state.goals.push({ id: newId(), name: form.elements.name.value.trim(), target: Number(form.elements.target.value), saved: Number(form.elements.saved.value) || 0 });
    save();
    document.getElementById('goal-dialog').close();
    renderAll();
    showToast('Meta criada.');
  });
  document.getElementById('contribution-form').addEventListener('submit', event => {
    event.preventDefault();
    const goal = state.goals.find(item => item.id === activeGoalId);
    if (!goal) return;
    goal.saved = Number(goal.saved || 0) + Number(event.currentTarget.elements.amount.value);
    save();
    document.getElementById('contribution-dialog').close();
    renderAll();
    showToast('Progresso da meta atualizado.');
  });

  document.body.addEventListener('click', event => {
    const editProfileExpense = event.target.closest('[data-edit-profile-expense]');
    if (editProfileExpense) {
      editingProfileExpenseId = editProfileExpense.dataset.editProfileExpense;
      renderProfileExpenseList();
      document.getElementById(`profile-expense-edit-${editingProfileExpenseId}`)?.focus();
    }
    const saveProfileExpense = event.target.closest('[data-save-profile-expense]');
    if (saveProfileExpense) {
      const expenseId = saveProfileExpense.dataset.saveProfileExpense;
      const amountInput = document.querySelector(`[data-profile-expense-value="${CSS.escape(expenseId)}"]`);
      const amount = Number(amountInput?.value);
      const item = profileExpenseDraft.find(expense => expense.id === expenseId);
      if (!item || !Number.isFinite(amount) || amount <= 0) {
        showToast('Informe um valor maior que zero.');
        amountInput?.focus();
        return;
      }
      item.amount = amount;
      editingProfileExpenseId = null;
      renderProfileExpenseList();
      renderProfileEstimate(profileFromForm(profileForm));
      showToast('Valor atualizado. Salve o perfil para manter a alteração.');
    }
    const cancelProfileExpense = event.target.closest('[data-cancel-profile-expense]');
    if (cancelProfileExpense) {
      editingProfileExpenseId = null;
      renderProfileExpenseList();
    }
    const removeProfileExpense = event.target.closest('[data-remove-profile-expense]');
    if (removeProfileExpense) {
      profileExpenseDraft = profileExpenseDraft.filter(item => item.id !== removeProfileExpense.dataset.removeProfileExpense);
      if (editingProfileExpenseId === removeProfileExpense.dataset.removeProfileExpense) editingProfileExpenseId = null;
      renderProfileExpenseList();
      renderProfileEstimate(profileFromForm(profileForm));
    }
    const completeButton = event.target.closest('[data-complete]');
    if (completeButton) {
      const entry = state.entries.find(item => item.id === completeButton.dataset.complete);
      if (entry) {
        entry.status = entry.type === 'income' ? 'received' : 'paid';
        save();
        renderAll();
        showToast(entry.type === 'income' ? 'Receita marcada como recebida.' : 'Conta marcada como paga.');
      }
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      state.entries = state.entries.filter(item => item.id !== deleteButton.dataset.delete);
      save();
      renderAll();
      showToast('Lançamento excluído.');
    }
    const deleteGoal = event.target.closest('[data-delete-goal]');
    if (deleteGoal) {
      state.goals = state.goals.filter(goal => goal.id !== deleteGoal.dataset.deleteGoal);
      save();
      renderAll();
      showToast('Meta excluída.');
    }
    const contribute = event.target.closest('[data-contribute]');
    if (contribute) {
      activeGoalId = contribute.dataset.contribute;
      const goal = state.goals.find(item => item.id === activeGoalId);
      if (goal) {
        document.getElementById('contribution-goal-name').textContent = `${goal.name} · ${money(goal.saved)} guardados de ${money(goal.target)}`;
        const form = document.getElementById('contribution-form');
        form.reset();
        document.getElementById('contribution-dialog').showModal();
        form.elements.amount.focus();
      }
    }
  });

  document.body.addEventListener('keydown', event => {
    const input = event.target.closest('[data-profile-expense-value]');
    if (!input) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      document.querySelector(`[data-save-profile-expense="${CSS.escape(input.dataset.profileExpenseValue)}"]`)?.click();
    } else if (event.key === 'Escape') {
      document.querySelector(`[data-cancel-profile-expense="${CSS.escape(input.dataset.profileExpenseValue)}"]`)?.click();
    }
  });

  document.body.addEventListener('change', event => {
    const categorySelect = event.target.closest('[data-profile-category]');
    if (!categorySelect) return;
    const item = profileExpenseDraft.find(expense => expense.id === categorySelect.dataset.profileCategory);
    if (!item) return;
    item.category = categorySelect.value;
    item.categorySource = 'manual';
    renderProfileExpenseList();
    renderProfileEstimate(profileFromForm(profileForm));
  });

  document.querySelectorAll('.modal').forEach(dialog => {
    dialog.querySelectorAll('.close-dialog, .cancel-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  });

  renderProfileForm();
  renderAll();
})();

