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

  const expenseFields = ['housing', 'food', 'bills', 'transport', 'healthEducation', 'personal', 'other'];
  const workRegimes = {
    employee: 'Emprego assalariado',
    'self-employed': 'Autônomo(a) / freelancer',
    'business-owner': 'Empreendedor(a) / MEI',
    mixed: 'Renda de mais de um regime',
    other: 'Outro / em transição'
  };

  function profileTotals(profile) {
    const fixedIncome = Number(profile.fixedIncome) || 0;
    const variableIncome = Number(profile.variableIncome) || 0;
    const expenses = profile.expenses || {};
    const monthlyExpenses = expenseFields.reduce((total, key) => total + (Number(expenses[key]) || 0), 0);
    const monthlyIncome = fixedIncome + variableIncome;
    return { fixedIncome, variableIncome, monthlyIncome, monthlyExpenses, estimatedMargin: monthlyIncome - monthlyExpenses };
  }

  function profileMetricsHTML(profile, compact = false) {
    const totals = profileTotals(profile);
    const marginLabel = totals.estimatedMargin < 0 ? 'Diferença estimada' : 'Margem estimada';
    return `<div class="profile-metric"><span>Renda mensal</span><strong>${money(totals.monthlyIncome)}</strong></div><div class="profile-metric"><span>Gastos pessoais</span><strong>${money(totals.monthlyExpenses)}</strong></div><div class="profile-metric ${totals.estimatedMargin < 0 ? 'profile-metric-negative' : ''}"><span>${marginLabel}</span><strong>${money(totals.estimatedMargin)}</strong></div>${compact ? '' : `<p class="profile-calculation-note">${escapeHTML(profile.name ? `${profile.name}, esta é uma estimativa baseada nos valores informados.` : 'Estimativa baseada nos valores informados.')}</p>`}`;
  }

  function renderProfileOverview() {
    const root = document.getElementById('profile-overview');
    if (!root) return;
    if (!state.profile?.saved) {
      root.innerHTML = '<div class="profile-empty"><span>Complete o perfil com sua renda e seus gastos mensais de referência para ver uma estimativa aqui.</span><button class="text-button" data-go="profile">Preencher perfil <span aria-hidden="true">→</span></button></div>';
      return;
    }
    root.innerHTML = `<div class="profile-regime">${escapeHTML(workRegimes[state.profile.workRegime] || workRegimes.other)}${state.profile.name ? ` · ${escapeHTML(state.profile.name)}` : ''}</div><div class="profile-metrics">${profileMetricsHTML(state.profile, true)}</div>`;
  }

  function profileFromForm(form) {
    const data = new FormData(form);
    const expenses = Object.fromEntries(expenseFields.map(key => [key, Number(data.get(key)) || 0]));
    return {
      saved: true,
      name: String(data.get('name') || '').trim(),
      workRegime: String(data.get('workRegime') || 'other'),
      fixedIncome: Number(data.get('fixedIncome')) || 0,
      variableIncome: Number(data.get('variableIncome')) || 0,
      expenses
    };
  }

  function renderProfileForm() {
    const form = document.getElementById('profile-form');
    const profile = state.profile || {};
    form.elements.name.value = profile.name || '';
    form.elements.workRegime.value = profile.workRegime || 'employee';
    form.elements.fixedIncome.value = profile.fixedIncome ?? '';
    form.elements.variableIncome.value = profile.variableIncome ?? '';
    expenseFields.forEach(key => { form.elements[key].value = profile.expenses?.[key] ?? ''; });
    renderProfileEstimate(profile.saved ? profile : profileFromForm(form));
  }

  function renderProfileEstimate(profile) {
    document.getElementById('profile-estimate').innerHTML = `<div class="profile-metrics">${profileMetricsHTML(profile)}</div>`;
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
  profileForm.addEventListener('change', () => renderProfileEstimate(profileFromForm(profileForm)));
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

  document.querySelectorAll('.modal').forEach(dialog => {
    dialog.querySelectorAll('.close-dialog, .cancel-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  });

  renderProfileForm();
  renderAll();
})();

