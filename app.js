(() => {
  const STORAGE_KEY = 'em-ordem-financas-v1';
  const categories = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Compras', 'Outros'];
  const EXTRA_SOURCE_TYPES = {
    freelance: { label: 'Freela / trabalho por fora', isBenefit: false },
    commission: { label: 'Comissões', isBenefit: false },
    'meal-benefit': { label: 'Vale-refeição', isBenefit: true },
    'transport-benefit': { label: 'Vale-transporte', isBenefit: true },
    'other-income': { label: 'Outra renda em dinheiro', isBenefit: false },
    'other-benefit': { label: 'Outro benefício', isBenefit: true }
  };
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
  const paymentDateValue = (year, monthIndex, paymentDay) => dateInputValue(new Date(year, monthIndex, Math.min(paymentDay, new Date(year, monthIndex + 1, 0).getDate())));
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
    const pendingIncome = entries.filter(item => item.type === 'income' && item.status !== 'received');
    const receivedTotal = received.reduce((sum, item) => sum + Number(item.amount), 0);
    const pendingIncomeTotal = pendingIncome.reduce((sum, item) => sum + Number(item.amount), 0);
    const paidTotal = paid.reduce((sum, item) => sum + Number(item.amount), 0);
    const pendingTotal = pendingBills.reduce((sum, item) => sum + Number(item.amount), 0);
    const savedForGoals = state.goals.reduce((sum, goal) => sum + Number(goal.saved || 0), 0);
    const cashBalance = openingBalance() + receivedTotal - paidTotal;
    const available = cashBalance - pendingTotal - savedForGoals;

    document.getElementById('available-value').textContent = money(available);
    document.getElementById('balance-explain').textContent = `${money(cashBalance)} em contas − ${money(pendingTotal)} em contas previstas − ${money(savedForGoals)} reservados para metas. Rendas previstas entram no saldo após confirmação.`;
    document.getElementById('income-total').textContent = money(receivedTotal);
    document.getElementById('planned-income-total').textContent = money(pendingIncomeTotal);
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
      const current = incomeGroups.get(key) || { description: item.description, incomeType: item.incomeType || 'variable', amount: 0, pending: 0, pendingDate: '' };
      current.amount += Number(item.amount);
      if (item.status !== 'received') {
        current.pending += Number(item.amount);
        if (!current.pendingDate || item.date < current.pendingDate) current.pendingDate = item.date;
      }
      incomeGroups.set(key, current);
    });
    const incomeRoot = document.getElementById('income-sources');
    const incomeRows = [...incomeGroups.values()].sort((a, b) => b.amount - a.amount);
    incomeRoot.innerHTML = incomeRows.length ? incomeRows.slice(0, 4).map(item => `
      <div class="income-source"><div><span class="source-name">${escapeHTML(item.description)}</span><span class="source-type ${item.incomeType === 'variable' ? 'variable' : ''}">${item.incomeType === 'fixed' ? 'Fixa' : 'Variável'}</span><div class="item-secondary">${item.pending ? `${money(item.pending)} prevista${item.pendingDate ? ` para ${dateLabel(item.pendingDate)}` : ''}` : 'Recebida no mês'}</div></div><strong class="source-total">${money(item.amount)}</strong></div>`).join('') : '<div class="empty-state">Adicione uma fonte de renda para acompanhar entradas fixas e variáveis.</div>';
  }

  const profileCategories = ['Moradia', 'Alimentação', 'Contas e serviços', 'Transporte', 'Saúde', 'Educação', 'Pessoais e lazer', 'Outros'];
  const workRegimes = {
    clt: 'Emprego com carteira assinada (CLT)',
    'public-federal': 'Servidor(a) público(a) federal',
    'public-local': 'Servidor(a) estadual ou municipal',
    'self-employed': 'Trabalho por conta própria / freelancer',
    mei: 'MEI',
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
    ? state.profile.expenseItems.map(item => ({ ...item, id: String(item.id || newId()), dueDay: Number(item.dueDay) || null, category: profileCategories.includes(item.category) ? item.category : 'Outros' }))
    : Object.entries(state.profile?.expenses || {}).filter(([, amount]) => Number(amount) > 0).map(([key, amount], index) => {
      const [category, description] = legacyExpenseCategories[key] || legacyExpenseCategories.other;
      return { id: `legacy-${index}`, description, amount: Number(amount), category, categorySource: 'manual' };
    });
  let profileExtraSourceDraft = Array.isArray(state.profile?.extraSources)
    ? state.profile.extraSources.map(item => ({ ...item, id: String(item.id || newId()), paymentDay: Number(item.paymentDay) || null, kind: EXTRA_SOURCE_TYPES[item.kind] ? item.kind : 'other-income', cadence: item.cadence === 'business-day' ? 'business-day' : 'monthly' }))
    : Number(state.profile?.grossVariableIncome) > 0
      ? [{ id: 'legacy-variable-income', kind: 'other-income', description: 'Renda extra anterior', amount: Number(state.profile.grossVariableIncome), cadence: 'monthly' }]
      : [];
  let editingProfileExpenseId = null;
  let editingProfileExtraSourceId = null;
  state.profile = { ...(state.profile || {}), expenseItems: profileExpenseDraft, extraSources: profileExtraSourceDraft };
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

  function businessDaysInRange(start, end) {
    let count = 0;
    for (const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate()); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) count += 1;
    }
    return count;
  }

  function businessDaysForProfileMonth(profile, period = { year: selectedMonth.getFullYear(), monthIndex: selectedMonth.getMonth() }) {
    const year = Number(period.year);
    const monthIndex = Number(period.monthIndex);
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    let days = businessDaysInRange(monthStart, monthEnd);
    const vacationStart = profile.vacationStartDate;
    const vacationEnd = profile.vacationEndDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacationStart || '') || !/^\d{4}-\d{2}-\d{2}$/.test(vacationEnd || '') || vacationStart > vacationEnd) return days;
    const start = new Date(`${vacationStart}T00:00:00`);
    const end = new Date(`${vacationEnd}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days;
    const overlapStart = start > monthStart ? start : monthStart;
    const overlapEnd = end < monthEnd ? end : monthEnd;
    if (overlapStart <= overlapEnd) days = Math.max(0, days - businessDaysInRange(overlapStart, overlapEnd));
    return days;
  }

  function extraSourceMonthlyAmount(item, profile = {}, period) {
    const amount = Math.max(0, Number(item.amount) || 0);
    return roundMoney(item.cadence === 'business-day' ? amount * businessDaysForProfileMonth(profile, period) : amount);
  }

  function profileExtraSourceTotals(profile, period) {
    const sources = Array.isArray(profile.extraSources) ? profile.extraSources : [];
    return sources.reduce((totals, item) => {
      const sourceType = EXTRA_SOURCE_TYPES[item.kind] || EXTRA_SOURCE_TYPES['other-income'];
      const monthlyAmount = extraSourceMonthlyAmount(item, profile, period);
      if (sourceType.isBenefit) totals.benefits += monthlyAmount;
      else totals.cashIncome += monthlyAmount;
      return totals;
    }, { cashIncome: 0, benefits: 0 });
  }

  function contractBenefitsEligible(profile) {
    if (['self-employed', 'mei', 'other'].includes(profile.workRegime)) return true;
    return profile.workRegime === 'mixed' && ['self-employed', 'mei'].includes(profile.variableRegime);
  }

  function calculateProfileIncome(profile, period) {
    const fixed = Math.max(0, Number(profile.grossFixedIncome) || 0);
    const extraSources = profileExtraSourceTotals(profile, period);
    const variable = Math.max(0, Number(Array.isArray(profile.extraSources) ? extraSources.cashIncome : profile.grossVariableIncome) || 0);
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
    if (reserves) notes.push('Autônomos e MEI não têm 13º ou férias calculados automaticamente como benefício trabalhista. As reservas abaixo são opcionais; valores acertados em contrato podem ser informados separadamente.');

    const legacy = profile.legacyNetIncome || {};
    const legacyNet = (Number(legacy.fixed) || 0) + (Number(legacy.variable) || 0);
    const hasGross = gross > 0;
    const monthlyNet = hasGross && !needsActivity ? roundMoney(net) : !hasGross && legacyNet > 0 ? legacyNet : null;
    const contractBaseType = profile.contractBenefitBase || 'gross';
    const contractBase = contractBaseType === 'gross' ? gross : contractBaseType === 'custom' ? Math.max(0, Number(profile.contractBenefitCustomBase) || 0) : Math.max(0, monthlyNet || 0);
    const contractBenefits = {
      applicable: contractBenefitsEligible(profile),
      base: contractBase,
      baseType: contractBaseType,
      thirteenth: profile.contractThirteenthEnabled ? {
        amount: roundMoney(contractBase * Math.max(0, Number(profile.contractThirteenthPercent) || 0) / 100),
        percent: Number(profile.contractThirteenthPercent) || 0,
        date: profile.contractThirteenthDate || ''
      } : null,
      vacation: profile.contractVacationEnabled ? {
        amount: roundMoney(contractBase * Math.max(0, Number(profile.contractVacationPercent) || 0) / 100),
        percent: Number(profile.contractVacationPercent) || 0,
        date: profile.contractVacationDate || ''
      } : null
    };
    return { gross: roundMoney(gross), pension: roundMoney(pension), irrf: roundMoney(irrf), otherDeductions: roundMoney(otherDeductions), monthlyNet, benefitsMonthly: roundMoney(extraSources.benefits), employmentGross, independentGross, thirteenth, vacation, reserves, contractBenefits, notes, hasGross, legacyNet, regime, needsActivity };
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
    return `<div class="profile-metric"><span>${incomeLabel}</span><strong>${incomeValue}</strong></div><div class="profile-metric"><span>Benefícios neste mês · fora do saldo</span><strong>${money(totals.calculation.benefitsMonthly)}</strong></div><div class="profile-metric"><span>Gastos pessoais</span><strong>${money(totals.monthlyExpenses)}</strong></div><div class="profile-metric ${!totals.calculation.needsActivity && totals.estimatedMargin < 0 ? 'profile-metric-negative' : ''}"><span>${marginLabel}</span><strong>${marginValue}</strong></div>${compact ? '' : `<p class="profile-calculation-note">${escapeHTML(profile.name ? `${profile.name}, esta é uma estimativa baseada nos valores informados.` : 'Estimativa baseada nos valores informados.')}</p>`}`;
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
    const extraSources = profileExtraSourceDraft.map(item => ({ ...item }));
    const vacationStartDate = String(data.get('vacationStartDate') || '');
    const vacationEndDate = String(data.get('vacationEndDate') || '');
    const grossVariableIncome = profileExtraSourceTotals({ extraSources, vacationStartDate, vacationEndDate }).cashIncome;
    return {
      saved: true,
      name: String(data.get('name') || '').trim(),
      workRegime: String(data.get('workRegime') || 'other'),
      grossFixedIncome,
      grossVariableIncome,
      extraSources,
      vacationStartDate,
      vacationEndDate,
      profileIncomeEnabled: data.get('profileIncomeEnabled') === 'on',
      paymentDay: Number(data.get('paymentDay')) || null,
      contractBenefitBase: String(data.get('contractBenefitBase') || 'gross'),
      contractBenefitCustomBase: Number(data.get('contractBenefitCustomBase')) || 0,
      contractThirteenthEnabled: data.get('contractThirteenthEnabled') === 'on',
      contractThirteenthPercent: Number(data.get('contractThirteenthPercent')),
      contractThirteenthDate: String(data.get('contractThirteenthDate') || ''),
      contractVacationEnabled: data.get('contractVacationEnabled') === 'on',
      contractVacationPercent: Number(data.get('contractVacationPercent')),
      contractVacationDate: String(data.get('contractVacationDate') || ''),
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

  function syncContractBenefitsSchedule(profile) {
    const todayKey = dateInputValue(new Date());
    state.entries = state.entries.filter(item => !(
      ['contract-thirteenth', 'contract-vacation'].includes(item.profileGeneratedKind)
      && item.status !== 'received' && item.date >= todayKey
    ));
    const contractBenefits = calculateProfileIncome(profile).contractBenefits;
    if (!contractBenefits.applicable) return;
    const upcomingContractPayments = [
      ['contract-thirteenth', '13º previsto em contrato', contractBenefits.thirteenth],
      ['contract-vacation', 'Adicional de férias previsto em contrato', contractBenefits.vacation]
    ];
    upcomingContractPayments.forEach(([kind, description, benefit]) => {
      if (!benefit?.date || !(benefit.amount > 0)) return;
      const [inputYear, inputMonth, inputDay] = benefit.date.split('-').map(Number);
      if (!inputYear || !inputMonth || !inputDay) return;
      let paymentYear = inputYear;
      let date = paymentDateValue(paymentYear, inputMonth - 1, inputDay);
      const wasReceived = candidate => state.entries.some(item => item.profileGeneratedKind === kind && item.date === candidate && item.status === 'received');
      while (date < todayKey || wasReceived(date)) date = paymentDateValue(++paymentYear, inputMonth - 1, inputDay);
      state.entries.push({
        id: newId(), type: 'income', description, amount: benefit.amount, date, category: '', incomeType: 'variable',
        status: 'planned', profileGenerated: true, profileGeneratedKind: kind, createdAt: Date.now()
      });
    });
  }

  function syncProfileIncomeSchedule(profile) {
    const today = new Date();
    const todayKey = dateInputValue(today);
    state.entries = state.entries.filter(item => !(item.type === 'income' && item.profileGenerated && !item.profileGeneratedKind && item.status !== 'received' && item.date >= todayKey));

    syncContractBenefitsSchedule(profile);
    const cashSources = (profile.extraSources || []).filter(item => !(EXTRA_SOURCE_TYPES[item.kind] || EXTRA_SOURCE_TYPES['other-income']).isBenefit && (Number(item.amount) || 0) > 0);
    const fixedGross = Number(profile.grossFixedIncome) || 0;
    if (!profile.profileIncomeEnabled || (!(fixedGross > 0) && !cashSources.length)) return;

    let scheduledCount = 0;
    for (let offset = 0; offset < 13 && scheduledCount < 12; offset += 1) {
      const monthIndex = today.getMonth() + offset;
      const year = today.getFullYear() + Math.floor(monthIndex / 12);
      const normalizedMonth = monthIndex % 12;
      const calculation = calculateProfileIncome(profile, { year, monthIndex: normalizedMonth });
      if (!calculation.hasGross || calculation.needsActivity) continue;

      const baseProfile = { ...profile, grossVariableIncome: 0, extraSources: [] };
      const baseCalculation = fixedGross > 0 ? calculateProfileIncome(baseProfile, { year, monthIndex: normalizedMonth }) : null;
      const scheduledInMonth = [];
      if (baseCalculation?.monthlyNet > 0) scheduledInMonth.push({ description: 'Renda fixa do perfil', amount: baseCalculation.monthlyNet, paymentDay: Number(profile.paymentDay), incomeType: 'fixed' });

      const includedSources = [];
      let previousNet = Number(baseCalculation?.monthlyNet) || 0;
      cashSources.forEach(source => {
        includedSources.push(source);
        const nextProfile = { ...profile, extraSources: [...includedSources] };
        const nextCalculation = calculateProfileIncome(nextProfile, { year, monthIndex: normalizedMonth });
        const increment = roundMoney(Math.max(0, (Number(nextCalculation.monthlyNet) || 0) - previousNet));
        previousNet = Number(nextCalculation.monthlyNet) || 0;
        const paymentDay = Number(source.paymentDay) || Number(profile.paymentDay);
        if (increment > 0 && paymentDay >= 1 && paymentDay <= 31) scheduledInMonth.push({ description: source.description || 'Renda extra', amount: increment, paymentDay, incomeType: 'variable' });
      });

      scheduledInMonth.forEach((scheduled, itemIndex) => {
        if (!Number.isFinite(scheduled.paymentDay) || scheduled.paymentDay < 1 || scheduled.paymentDay > 31) return;
        const date = paymentDateValue(year, normalizedMonth, scheduled.paymentDay);
        if (date < todayKey) return;
        const amount = roundMoney(scheduled.amount);
        const existingManualIncome = state.entries.some(item => !item.profileGenerated && item.type === 'income' && item.incomeType === scheduled.incomeType && item.date === date && roundMoney(item.amount) === amount);
        if (existingManualIncome) return;
        state.entries.push({
          id: newId(), type: 'income', description: scheduled.description, amount, date,
          category: '', incomeType: scheduled.incomeType, status: 'planned', profileGenerated: true,
          profileGeneratedIncome: true, createdAt: Date.now() + offset + itemIndex
        });
      });
      if (scheduledInMonth.length) scheduledCount += 1;
    }
  }

  function syncProfileExpenseSchedule(profile) {
    const today = new Date();
    const todayKey = dateInputValue(today);
    state.entries = state.entries.filter(item => !(item.type === 'bill' && item.profileExpenseGenerated && item.status !== 'paid' && item.date >= todayKey));
    (profile.expenseItems || []).forEach(expense => {
      const dueDay = Number(expense.dueDay);
      const amount = roundMoney(Number(expense.amount) || 0);
      if (dueDay < 1 || dueDay > 31 || amount <= 0) return;
      for (let offset = 0; offset < 12; offset += 1) {
        const monthIndex = today.getMonth() + offset;
        const year = today.getFullYear() + Math.floor(monthIndex / 12);
        const normalizedMonth = monthIndex % 12;
        const date = paymentDateValue(year, normalizedMonth, dueDay);
        if (date < todayKey) continue;
        const description = expense.description || 'Despesa fixa';
        const manualDuplicate = state.entries.some(item => item.type === 'bill' && !item.profileExpenseGenerated && item.date === date && roundMoney(item.amount) === amount && String(item.description || '').trim().toLocaleLowerCase('pt-BR') === description.trim().toLocaleLowerCase('pt-BR'));
        if (manualDuplicate) continue;
        const alreadyGenerated = state.entries.some(item => item.profileExpenseGenerated && item.profileExpenseId === expense.id && item.date === date);
        if (alreadyGenerated) continue;
        state.entries.push({
          id: newId(), type: 'bill', description, amount, date, category: expense.category || 'Outros',
          incomeType: '', status: 'pending', profileGenerated: true, profileExpenseGenerated: true,
          profileExpenseId: expense.id, createdAt: Date.now() + offset
        });
      }
    });
  }

  function renderProfileForm() {
    const form = document.getElementById('profile-form');
    const profile = state.profile || {};
    form.elements.name.value = profile.name || '';
    form.elements.workRegime.value = profile.workRegime || 'clt';
    form.elements.grossFixedIncome.value = profile.grossFixedIncome ?? '';
    form.elements.vacationStartDate.value = profile.vacationStartDate || '';
    form.elements.vacationEndDate.value = profile.vacationEndDate || '';
    document.getElementById('profile-vacation-details').open = Boolean(profile.vacationStartDate || profile.vacationEndDate);
    form.elements.profileIncomeEnabled.checked = profile.profileIncomeEnabled ?? true;
    form.elements.paymentDay.value = profile.paymentDay ?? '';
    form.elements.contractBenefitBase.value = profile.contractBenefitBase || 'gross';
    form.elements.contractBenefitCustomBase.value = profile.contractBenefitCustomBase ?? '';
    form.elements.contractThirteenthEnabled.checked = profile.contractThirteenthEnabled ?? false;
    form.elements.contractThirteenthPercent.value = profile.contractThirteenthPercent ?? 100;
    form.elements.contractThirteenthDate.value = profile.contractThirteenthDate || '';
    form.elements.contractVacationEnabled.checked = profile.contractVacationEnabled ?? false;
    form.elements.contractVacationPercent.value = profile.contractVacationPercent ?? 33.33;
    form.elements.contractVacationDate.value = profile.contractVacationDate || '';
    form.elements.monthsWorked.value = profile.monthsWorked ?? 12;
    form.elements.dependents.value = profile.dependents ?? 0;
    form.elements.variableRegime.value = profile.variableRegime || 'self-employed';
    form.elements.meiActivity.value = profile.meiActivity || '';
    form.elements.contributionMode.value = profile.contributionMode || '20';
    form.elements.publicPension.value = profile.publicPension ?? '';
    form.elements.otherDeductions.value = profile.otherDeductions ?? '';
    updateProfileRegimeFields();
    renderProfileExtraSourceList();
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

  function renderProfileExtraSourceList() {
    const root = document.getElementById('profile-extra-income-list');
    if (!root) return;
    root.innerHTML = profileExtraSourceDraft.length ? profileExtraSourceDraft.map(item => {
      const source = EXTRA_SOURCE_TYPES[item.kind] || EXTRA_SOURCE_TYPES['other-income'];
      const currentProfile = profileFromForm(document.getElementById('profile-form'));
      const monthlyAmount = extraSourceMonthlyAmount(item, currentProfile);
      const unit = item.cadence === 'business-day' ? 'por dia útil' : 'por mês';
      const isEditing = editingProfileExtraSourceId === item.id;
      return `<article class="profile-extra-source-row">
        <div class="profile-extra-source-summary"><div class="profile-extra-source-title"><strong>${escapeHTML(item.description || source.label)}</strong><span>${source.label} · ${source.isBenefit ? 'benefício' : 'dinheiro'}</span></div><div class="profile-extra-source-monthly"><span>${item.cadence === 'business-day' ? `Estimativa · ${businessDaysForProfileMonth(currentProfile)} dias úteis` : 'Valor por mês'}</span><strong>${money(monthlyAmount)}</strong></div>
          <div class="profile-extra-source-actions"><button class="small-action" type="button" data-edit-extra-source="${escapeHTML(item.id)}" aria-expanded="${isEditing}" aria-controls="extra-source-edit-${escapeHTML(item.id)}">${isEditing ? 'Fechar edição' : 'Editar'}</button><button class="small-action delete" type="button" data-remove-extra-source="${escapeHTML(item.id)}" aria-label="Remover ${escapeHTML(item.description || source.label)}">Remover</button></div></div>
        <div class="profile-extra-source-edit" id="extra-source-edit-${escapeHTML(item.id)}"${isEditing ? '' : ' hidden'}>
          <label class="field">Nome para identificar (opcional)<input name="extraSourceName" data-extra-source-name="${escapeHTML(item.id)}" maxlength="50" autocomplete="off" value="${escapeHTML(item.description || '')}"></label>
          <label class="field">Valor ${unit} (R$)<input name="extraSourceAmount" data-extra-source-amount="${escapeHTML(item.id)}" type="number" min="0.01" step="0.01" inputmode="decimal" autocomplete="off" value="${Number(item.amount) || ''}"></label>
          <label class="field">Como calcular?<select name="extraSourceCadence" data-extra-source-cadence="${escapeHTML(item.id)}"><option value="monthly"${item.cadence === 'monthly' ? ' selected' : ''}>Valor mensal</option><option value="business-day"${item.cadence === 'business-day' ? ' selected' : ''}>Por dia útil</option></select></label>
          ${source.isBenefit ? '' : `<label class="field">Dia do recebimento<input name="extraSourcePaymentDay" data-extra-source-payment-day="${escapeHTML(item.id)}" type="number" min="1" max="31" step="1" inputmode="numeric" autocomplete="off" placeholder="Dia principal" value="${Number(item.paymentDay) || ''}"><span class="field-help">Em branco: usa o dia da renda fixa.</span></label>`}
        </div>
      </article>`;
    }).join('') : '<div class="profile-list-empty">Nenhuma renda extra ou benefício adicionado.</div>';
  }

  function updateProfileExtraSourceSummaries() {
    const form = document.getElementById('profile-form');
    const currentProfile = profileFromForm(form);
    profileExtraSourceDraft.forEach(item => {
      const row = document.querySelector(`[data-extra-source-amount="${CSS.escape(item.id)}"]`)?.closest('.profile-extra-source-row');
      if (!row) return;
      const summary = row.querySelector('.profile-extra-source-monthly');
      summary.querySelector('strong').textContent = money(extraSourceMonthlyAmount(item, currentProfile));
      summary.querySelector('span').textContent = item.cadence === 'business-day' ? `Estimativa · ${businessDaysForProfileMonth(currentProfile)} dias úteis` : 'Valor por mês';
    });
  }

  function updateProfileRegimeFields() {
    const form = document.getElementById('profile-form');
    const regime = form.elements.workRegime.value;
    const variableRegime = form.elements.variableRegime.value;
    const isMixed = regime === 'mixed';
    const isMei = regime === 'mei' || (isMixed && variableRegime === 'mei');
    const isSelfEmployed = regime === 'self-employed' || (isMixed && variableRegime === 'self-employed');
    const hasEmploymentBenefits = ['clt', 'public-federal', 'public-local', 'mixed'].includes(regime);
    const supportsDependents = ['clt', 'public-federal', 'public-local', 'self-employed', 'mixed'].includes(regime);
    document.getElementById('mixed-income-note').hidden = !isMixed;
    document.getElementById('mixed-variable-field').hidden = !isMixed;
    document.getElementById('mei-activity-field').hidden = !isMei;
    document.getElementById('independent-contribution-field').hidden = !isSelfEmployed;
    document.getElementById('public-pension-field').hidden = regime !== 'public-local';
    document.getElementById('other-deductions-field').hidden = regime !== 'other';
    document.getElementById('months-worked-field').hidden = !hasEmploymentBenefits;
    document.getElementById('dependents-field').hidden = !supportsDependents;
    const hasCalculationDetails = hasEmploymentBenefits || supportsDependents || isMei || isSelfEmployed || regime === 'other';
    const calculationDetails = document.getElementById('income-calculation-details');
    calculationDetails.hidden = !hasCalculationDetails;
    document.getElementById('profile-regime-options').hidden = !isMixed && !isMei && !isSelfEmployed && regime !== 'public-local' && regime !== 'other';
    const grossIncome = Number(form.elements.grossFixedIncome.value) + profileExtraSourceTotals({ extraSources: profileExtraSourceDraft }).cashIncome;
    form.elements.meiActivity.required = isMei && grossIncome > 0;
    if (isMixed || (isMei && grossIncome > 0 && !form.elements.meiActivity.value)) calculationDetails.open = true;
    const incomeScheduleEnabled = form.elements.profileIncomeEnabled.checked;
    document.getElementById('profile-income-schedule-fields').hidden = !incomeScheduleEnabled;
    const calculation = calculateProfileIncome(profileFromForm(form));
    const cashSources = profileExtraSourceDraft.filter(item => !(EXTRA_SOURCE_TYPES[item.kind] || EXTRA_SOURCE_TYPES['other-income']).isBenefit && (Number(item.amount) || 0) > 0);
    const needsMainPaymentDay = Number(form.elements.grossFixedIncome.value) > 0 || cashSources.some(item => !(Number(item.paymentDay) >= 1 && Number(item.paymentDay) <= 31));
    form.elements.paymentDay.required = incomeScheduleEnabled && calculation.hasGross && !calculation.needsActivity && calculation.monthlyNet > 0 && needsMainPaymentDay;
    const contractEligible = contractBenefitsEligible({ workRegime: regime, variableRegime });
    const contractDetails = document.getElementById('contract-benefits-details');
    contractDetails.hidden = !contractEligible;
    document.getElementById('contract-benefit-custom-base').hidden = form.elements.contractBenefitBase.value !== 'custom';
    form.elements.contractBenefitCustomBase.required = false;
    document.getElementById('contract-thirteenth-fields').hidden = !form.elements.contractThirteenthEnabled.checked;
    document.getElementById('contract-vacation-fields').hidden = !form.elements.contractVacationEnabled.checked;
    form.elements.contractThirteenthPercent.required = false;
    form.elements.contractThirteenthDate.required = false;
    form.elements.contractVacationPercent.required = false;
    form.elements.contractVacationDate.required = false;
  }

  function contractBenefitsPreview(result) {
    const benefits = result.contractBenefits;
    if (!benefits?.applicable) return '';
    const rows = [
      ['Pagamento anual equivalente ao 13º', benefits.thirteenth],
      ['Adicional de férias', benefits.vacation]
    ].filter(([, benefit]) => benefit && benefit.amount > 0);
    if (!rows.length) return '';
    const cards = rows.map(([label, benefit]) => {
      const date = benefit.date ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateFromInput(benefit.date)) : 'Escolha uma data';
      return `<div><span>${label} · ${benefit.percent}% da base</span><strong>${money(benefit.amount)}</strong><small>Pagamento informado: ${escapeHTML(date)}</small></div>`;
    }).join('');
    return `<div class="salary-contract-benefits"><h3>Valores extras previstos em contrato</h3>${cards}<p class="salary-note">Estimativa conforme a base, o percentual e a data informados. O PFO não acrescenta descontos ou impostos a estes valores.</p></div>`;
  }

  function renderSalaryCalculation(profile) {
    const root = document.getElementById('salary-calculation');
    const result = calculateProfileIncome(profile);
    const contractPreview = contractBenefitsPreview(result);
    if (result.needsActivity) {
      root.innerHTML = `<div class="salary-empty">Para estimar sua renda do MEI, abra “Ver detalhes de descontos e cálculos” e escolha sua atividade.</div>${contractPreview}`;
      return;
    }
    if (!result.hasGross) {
      root.innerHTML = result.legacyNet > 0
        ? `<div class="salary-empty">Informe sua renda mensal para atualizar a estimativa. Sua renda anterior continua como referência até lá.</div>${contractPreview}`
        : `<div class="salary-empty">Adicione sua renda mensal para ver quanto pode sobrar depois dos descontos.</div>${contractPreview}`;
      return;
    }
    const meiOnly = result.regime === 'mei';
    const contributionLabel = result.regime === 'public-federal' || result.regime === 'public-local' ? 'Previdência / RPPS' : 'INSS / contribuição previdenciária';
    const totalDeductions = roundMoney(result.pension + result.irrf + result.otherDeductions);
    const metrics = [
      ['Total recebido antes dos descontos', money(result.gross)],
      [meiOnly ? 'DAS — parcela previdenciária' : contributionLabel, money(result.pension)],
      ['IRRF estimado', money(result.irrf)],
      ...(meiOnly || (result.regime === 'mixed' && profile.variableRegime === 'mei') ? [['DAS — ICMS/ISS', money(result.otherDeductions)]] : result.otherDeductions ? [['Outros descontos informados', money(result.otherDeductions)]] : []),
      ['Total descontado estimado', money(totalDeductions)],
      ['Renda após descontos estimados', money(result.monthlyNet)]
    ];
    const reserveMarkup = result.reserves ? `<details class="salary-extra-details"><summary>Ver sugestão de reserva para 13º e férias (opcional)</summary>
      <div class="salary-reserve"><h3>Quanto guardar por mês, se quiser formar essa reserva</h3><div><span>Para um 13º equivalente</span><strong>${money(result.reserves.thirteenthMonthly)}</strong></div><div><span>Para um mês de férias + 1/3</span><strong>${money(result.reserves.vacationMonthly)}</strong></div></div></details>` : '';
    const benefitMarkup = result.thirteenth && result.vacation ? `<details class="salary-extra-details"><summary>Ver estimativa de 13º e férias</summary>
      <div class="salary-benefit-grid">
        <article class="salary-benefit"><h3>13º salário estimado</h3><div><span>Bruto</span><strong>${money(result.thirteenth.gross)}</strong></div><div><span>INSS / previdência + IRRF</span><strong>${money(result.thirteenth.pension + result.thirteenth.irrf)}</strong></div><div><span>Líquido estimado</span><strong>${money(result.thirteenth.net)}</strong></div></article>
        <article class="salary-benefit"><h3>Férias + 1/3 estimadas</h3><div><span>Total bruto</span><strong>${money(result.vacation.gross)}</strong></div><div><span>Adicional de 1/3 incluído</span><strong>${money(result.vacation.bonus)}</strong></div><div><span>INSS / previdência + IRRF</span><strong>${money(result.vacation.pension + result.vacation.irrf)}</strong></div><div><span>Líquido estimado</span><strong>${money(result.vacation.net)}</strong></div></article>
      </div></details>` : '';
    const notes = result.notes.map(note => `<p class="salary-note">${escapeHTML(note)}</p>`).join('');
    root.innerHTML = `<div class="salary-calculation-heading"><strong>Quanto deve sobrar por mês</strong><span>Estimativa, não é um valor garantido</span></div><div class="salary-net-summary"><span>Renda após descontos estimados</span><strong>${money(result.monthlyNet)}</strong></div><details class="salary-extra-details"><summary>Ver como calculamos sua renda</summary><div class="salary-metrics">${metrics.map(([label, value], index) => `<div class="salary-metric ${label.startsWith('Total descontado') ? 'salary-metric-total' : ''} ${index === metrics.length - 1 ? 'salary-metric-net' : ''}"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>${notes}</details>${benefitMarkup}${reserveMarkup}${contractPreview}`;
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
        <div class="profile-expense-summary"><div class="profile-expense-description"><strong>${escapeHTML(item.description)}</strong><span>${escapeHTML(item.category || 'Outros')} · ${item.dueDay ? `vence todo dia ${item.dueDay}` : 'vencimento não informado'}</span></div>
        <div class="profile-expense-value">${editingProfileExpenseId === item.id
          ? `<strong class="profile-expense-amount">${money(item.amount)}</strong>`
          : `<strong class="profile-expense-amount">${money(item.amount)}</strong><button class="small-action" type="button" data-edit-profile-expense="${escapeHTML(item.id)}" aria-label="Editar ${escapeHTML(item.description)}">Editar</button>`}</div>
        <button class="small-action delete" type="button" data-remove-profile-expense="${escapeHTML(item.id)}" aria-label="Remover despesa ${escapeHTML(item.description)}">Remover</button>
        </div>
        ${editingProfileExpenseId === item.id ? `<div class="profile-expense-edit"><label class="field" for="profile-expense-edit-${escapeHTML(item.id)}">Novo valor mensal (R$)<input name="profileExpenseEditAmount" class="profile-expense-value-input" id="profile-expense-edit-${escapeHTML(item.id)}" data-profile-expense-value="${escapeHTML(item.id)}" type="number" min="0.01" step="0.01" inputmode="decimal" autocomplete="off" value="${Number(item.amount)}"></label><label class="field">Categoria<select name="profileExpenseCategory" data-profile-category="${escapeHTML(item.id)}" aria-label="Categoria para ${escapeHTML(item.description)}">${profileCategories.map(category => `<option${item.category === category ? ' selected' : ''}>${category}</option>`).join('')}</select></label><label class="field">Dia do vencimento<input name="profileExpenseDueDayEdit" data-profile-expense-due-day="${escapeHTML(item.id)}" type="number" min="1" max="31" step="1" inputmode="numeric" placeholder="Ex.: 10" value="${Number(item.dueDay) || ''}"><span class="field-help">Sem dia, não há previsão automática.</span></label><div class="profile-expense-edit-actions"><button class="small-action" type="button" data-save-profile-expense="${escapeHTML(item.id)}">Salvar</button><button class="small-action" type="button" data-cancel-profile-expense="${escapeHTML(item.id)}">Cancelar</button></div></div>` : ''}
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
    const skipTargets = { overview: 'page-title', transactions: 'transactions-title', planning: 'planning-title', goals: 'goals-title', profile: 'profile-title' };
    document.getElementById('skip-link').href = `#${skipTargets[name] || skipTargets.overview}`;
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
  profileForm.addEventListener('input', () => {
    updateProfileRegimeFields();
    updateProfileExtraSourceSummaries();
    const vacationStart = profileForm.elements.vacationStartDate.value;
    const vacationEnd = profileForm.elements.vacationEndDate.value;
    if ((!vacationStart && !vacationEnd) || (vacationStart && vacationEnd && vacationStart <= vacationEnd)) document.getElementById('vacation-period-error').hidden = true;
    renderProfileEstimate(profileFromForm(profileForm));
  });
  profileForm.addEventListener('change', () => {
    updateProfileRegimeFields();
    updateProfileExtraSourceSummaries();
    renderProfileEstimate(profileFromForm(profileForm));
  });
  const extraSourceCadence = document.getElementById('extra-source-cadence');
  extraSourceCadence.addEventListener('change', () => {
    document.getElementById('extra-source-amount-label').firstChild.textContent = extraSourceCadence.value === 'business-day' ? 'Quanto recebe por dia útil? (R$)' : 'Quanto recebe por mês? (R$)';
  });
  document.getElementById('extra-source-kind').addEventListener('change', event => {
    const isBenefit = (EXTRA_SOURCE_TYPES[event.currentTarget.value] || EXTRA_SOURCE_TYPES['other-income']).isBenefit;
    document.getElementById('extra-source-payment-day-field').hidden = isBenefit;
    if (isBenefit) document.getElementById('extra-source-payment-day').value = '';
  });
  document.getElementById('extra-source-amount').addEventListener('input', event => {
    if (Number(event.currentTarget.value) > 0) document.getElementById('extra-source-error').hidden = true;
  });
  document.getElementById('add-extra-source').addEventListener('click', () => {
    const kind = document.getElementById('extra-source-kind').value;
    const amountInput = document.getElementById('extra-source-amount');
    const amount = Number(amountInput.value);
    if (!(amount > 0)) {
      document.getElementById('extra-source-error').hidden = false;
      amountInput.focus();
      return;
    }
    document.getElementById('extra-source-error').hidden = true;
    const sourceType = EXTRA_SOURCE_TYPES[kind] || EXTRA_SOURCE_TYPES['other-income'];
    profileExtraSourceDraft.push({
      id: newId(), kind,
      description: document.getElementById('extra-source-name').value.trim() || sourceType.label,
      amount, cadence: extraSourceCadence.value,
      paymentDay: Number(document.getElementById('extra-source-payment-day').value) || null
    });
    amountInput.value = '';
    document.getElementById('extra-source-name').value = '';
    document.getElementById('extra-source-payment-day').value = '';
    renderProfileExtraSourceList();
    updateProfileRegimeFields();
    renderProfileEstimate(profileFromForm(profileForm));
    amountInput.focus();
  });
  const extraSourceList = document.getElementById('profile-extra-income-list');
  extraSourceList.addEventListener('input', event => {
    const amountInput = event.target.closest('[data-extra-source-amount]');
    const source = amountInput && profileExtraSourceDraft.find(item => item.id === amountInput.dataset.extraSourceAmount);
    if (source) {
      source.amount = Number(amountInput.value) || 0;
      updateProfileExtraSourceSummaries();
    }
    const nameInput = event.target.closest('[data-extra-source-name]');
    const namedSource = nameInput && profileExtraSourceDraft.find(item => item.id === nameInput.dataset.extraSourceName);
    if (namedSource) {
      namedSource.description = nameInput.value;
      nameInput.closest('.profile-extra-source-row').querySelector('.profile-extra-source-title strong').textContent = nameInput.value || EXTRA_SOURCE_TYPES[namedSource.kind].label;
    }
  });
  extraSourceList.addEventListener('change', event => {
    const cadenceSelect = event.target.closest('[data-extra-source-cadence]');
    const paymentDayInput = event.target.closest('[data-extra-source-payment-day]');
    if (!cadenceSelect && !paymentDayInput) return;
    const sourceId = cadenceSelect?.dataset.extraSourceCadence || paymentDayInput.dataset.extraSourcePaymentDay;
    const source = profileExtraSourceDraft.find(item => item.id === sourceId);
    if (!source) return;
    if (cadenceSelect) source.cadence = cadenceSelect.value;
    if (paymentDayInput) source.paymentDay = Number(paymentDayInput.value) || null;
    if (cadenceSelect) renderProfileExtraSourceList();
    updateProfileRegimeFields();
    renderProfileEstimate(profileFromForm(profileForm));
  });
  extraSourceList.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-extra-source]');
    if (editButton) {
      const sourceId = editButton.dataset.editExtraSource;
      editingProfileExtraSourceId = editingProfileExtraSourceId === sourceId ? null : sourceId;
      renderProfileExtraSourceList();
      if (editingProfileExtraSourceId) document.querySelector(`[data-extra-source-amount="${CSS.escape(editingProfileExtraSourceId)}"]`)?.focus();
      else document.querySelector(`[data-edit-extra-source="${CSS.escape(sourceId)}"]`)?.focus();
      return;
    }
    const removeButton = event.target.closest('[data-remove-extra-source]');
    if (!removeButton) return;
    const sourceToRemove = profileExtraSourceDraft.find(item => item.id === removeButton.dataset.removeExtraSource);
    if (!window.confirm(`Remover “${sourceToRemove?.description || 'este valor'}” do perfil?`)) return;
    profileExtraSourceDraft = profileExtraSourceDraft.filter(item => item.id !== removeButton.dataset.removeExtraSource);
    if (editingProfileExtraSourceId === removeButton.dataset.removeExtraSource) editingProfileExtraSourceId = null;
    renderProfileExtraSourceList();
    updateProfileRegimeFields();
    renderProfileEstimate(profileFromForm(profileForm));
  });
  [document.getElementById('extra-source-name'), document.getElementById('extra-source-amount'), document.getElementById('extra-source-payment-day')].forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('add-extra-source').click();
    }
  }));
  document.getElementById('add-profile-expense').addEventListener('click', () => {
    const description = document.getElementById('profile-expense-description');
    const amount = document.getElementById('profile-expense-amount');
    const dueDayInput = document.getElementById('profile-expense-due-day');
    const cleanDescription = description.value.trim();
    const numericAmount = Number(amount.value);
    const dueDay = Number(dueDayInput.value);
    if (!cleanDescription || !numericAmount || numericAmount < 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      showToast('Informe o nome, valor e dia de vencimento da despesa.');
      (!cleanDescription ? description : !numericAmount || numericAmount < 0 ? amount : dueDayInput).focus();
      return;
    }
    profileExpenseDraft.push({ id: newId(), description: cleanDescription, amount: numericAmount, dueDay, category: classifyProfileExpense(cleanDescription), categorySource: 'auto' });
    description.value = '';
    amount.value = '';
    dueDayInput.value = '';
    renderProfileExpenseList();
    renderProfileEstimate(profileFromForm(profileForm));
    description.focus();
  });
  [document.getElementById('profile-expense-description'), document.getElementById('profile-expense-amount'), document.getElementById('profile-expense-due-day')].forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('add-profile-expense').click();
    }
  }));
  profileForm.addEventListener('submit', event => {
    event.preventDefault();
    const submittedProfile = profileFromForm(event.currentTarget);
    const vacationError = document.getElementById('vacation-period-error');
    const hasVacationStart = Boolean(submittedProfile.vacationStartDate);
    const hasVacationEnd = Boolean(submittedProfile.vacationEndDate);
    if (hasVacationStart !== hasVacationEnd || (hasVacationStart && submittedProfile.vacationStartDate > submittedProfile.vacationEndDate)) {
      document.getElementById('profile-vacation-details').open = true;
      vacationError.hidden = false;
      const focusField = hasVacationStart && (!hasVacationEnd || submittedProfile.vacationStartDate > submittedProfile.vacationEndDate) ? event.currentTarget.elements.vacationEndDate : event.currentTarget.elements.vacationStartDate;
      focusField.focus();
      return;
    }
    vacationError.hidden = true;
    if (contractBenefitsEligible(submittedProfile)) {
      const checks = [
        [submittedProfile.contractThirteenthEnabled, submittedProfile.contractThirteenthDate, submittedProfile.contractThirteenthPercent, 'contractThirteenthDate', 'contractThirteenthPercent'],
        [submittedProfile.contractVacationEnabled, submittedProfile.contractVacationDate, submittedProfile.contractVacationPercent, 'contractVacationDate', 'contractVacationPercent']
      ];
      const missingPaymentDetail = checks.find(([enabled, date, percent]) => enabled && (!date || !(percent > 0)));
      const missingBase = (submittedProfile.contractThirteenthEnabled || submittedProfile.contractVacationEnabled)
        && submittedProfile.contractBenefitBase === 'custom' && submittedProfile.contractBenefitCustomBase <= 0;
      if (missingPaymentDetail || missingBase) {
        const details = document.getElementById('contract-benefits-details');
        details.open = true;
        const missingDate = missingPaymentDetail && !missingPaymentDetail[1];
        const target = missingPaymentDetail
          ? event.currentTarget.elements[missingDate ? missingPaymentDetail[3] : missingPaymentDetail[4]]
          : event.currentTarget.elements.contractBenefitCustomBase;
        showToast(missingPaymentDetail ? (missingDate ? 'Informe a data do pagamento previsto no contrato.' : 'Informe um percentual acima de zero.') : 'Informe o valor mensal combinado como base.');
        target.focus();
        return;
      }
    }
    state.profile = submittedProfile;
    syncProfileIncomeSchedule(state.profile);
    syncProfileExpenseSchedule(state.profile);
    save();
    renderAll();
    renderProfileEstimate(state.profile);
    const hasUpcomingProfileForecast = state.entries.some(item => item.profileGenerated && item.status !== 'received' && item.status !== 'paid' && item.date >= dateInputValue(new Date()));
    showToast(hasUpcomingProfileForecast ? 'Perfil salvo. Previsões de recebimentos e contas atualizadas no painel.' : 'Perfil salvo. A estimativa mensal foi atualizada.');
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
      const dueDayInput = document.querySelector(`[data-profile-expense-due-day="${CSS.escape(expenseId)}"]`);
      const amount = Number(amountInput?.value);
      const dueDayValue = dueDayInput?.value.trim() || '';
      const dueDay = dueDayValue ? Number(dueDayValue) : null;
      const item = profileExpenseDraft.find(expense => expense.id === expenseId);
      if (!item || !Number.isFinite(amount) || amount <= 0) {
        showToast('Informe um valor maior que zero.');
        amountInput?.focus();
        return;
      }
      if (dueDayValue && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
        showToast('Informe um dia de vencimento entre 1 e 31.');
        dueDayInput?.focus();
        return;
      }
      item.amount = amount;
      item.dueDay = dueDay;
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
      const expenseToRemove = profileExpenseDraft.find(item => item.id === removeProfileExpense.dataset.removeProfileExpense);
      if (!window.confirm(`Remover “${expenseToRemove?.description || 'esta despesa'}” do perfil?`)) return;
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
        if (entry.profileGeneratedKind && state.profile.saved) syncContractBenefitsSchedule(state.profile);
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
    categorySelect.closest('.profile-expense-edit').closest('.profile-expense-row').querySelector('.profile-expense-description span').textContent = `${item.category} · ${item.dueDay ? `vence todo dia ${item.dueDay}` : 'vencimento não informado'}`;
    renderProfileEstimate(profileFromForm(profileForm));
  });

  document.querySelectorAll('.modal').forEach(dialog => {
    dialog.querySelectorAll('.close-dialog, .cancel-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  });

  renderProfileForm();
  renderAll();
})();

