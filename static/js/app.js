// Application State
const state = {
    user: {
        username: '',
        currency: 'USD'
    },
    transactions: [],
    budgets: {},
    goals: [],
    summary: {
        total_income: 0,
        total_expense: 0,
        balance: 0,
        expense_by_category: {},
        monthly_trends: []
    },
    filters: {
        search: '',
        type: 'all',
        category: 'all'
    },
    sort: {
        key: 'date',
        asc: false
    }
};

// Currency Configurations
const CURRENCY_CONFIGS = {
    'USD': { locale: 'en-US', symbol: '$', code: 'USD' },
    'EUR': { locale: 'de-DE', symbol: '€', code: 'EUR' },
    'GBP': { locale: 'en-GB', symbol: '£', code: 'GBP' },
    'INR': { locale: 'en-IN', symbol: '₹', code: 'INR' },
    'JPY': { locale: 'ja-JP', symbol: '¥', code: 'JPY' },
    'CAD': { locale: 'en-CA', symbol: 'C$', code: 'CAD' }
};

// Category Configs (for styling and forms)
const CATEGORY_MAP = {
    // Expenses
    'Food': { badge: 'badge-food', color: '#fbbf24' },
    'Rent': { badge: 'badge-rent', color: '#60a5fa' },
    'Utilities': { badge: 'badge-utilities', color: '#34d399' },
    'Transport': { badge: 'badge-transport', color: '#22d3ee' },
    'Shopping': { badge: 'badge-shopping', color: '#f472b6' },
    'Entertainment': { badge: 'badge-entertainment', color: '#c084fc' },
    'Healthcare': { badge: 'badge-healthcare', color: '#f87171' },
    // Income
    'Salary': { badge: 'badge-salary', color: '#34d399' },
    'Investments': { badge: 'badge-investments', color: '#38bdf8' },
    // Both
    'Others': { badge: 'badge-others', color: '#cbd5e1' }
};

const EXPENSE_CATEGORIES = ['Food', 'Rent', 'Utilities', 'Transport', 'Shopping', 'Entertainment', 'Healthcare', 'Others'];
const INCOME_CATEGORIES = ['Salary', 'Investments', 'Others'];

// Chart Instances
let trendChartInstance = null;
let categoryChartInstance = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupEventListeners();
    setDefaultDates();
    verifyAuth();
});

// Navigation Handling
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    function switchView(targetHash) {
        const targetId = targetHash ? targetHash.substring(1) + '-view' : 'dashboard-view';
        
        // Update active class on nav links
        navItems.forEach(item => {
            const href = item.getAttribute('href');
            if (href === targetHash || (targetHash === '' && href === '#dashboard')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update active class on sections
        let foundSection = false;
        sections.forEach(section => {
            if (section.id === targetId) {
                section.classList.add('active');
                foundSection = true;
            } else {
                section.classList.remove('active');
            }
        });

        // Fallback to dashboard if hash is invalid
        if (!foundSection) {
            document.getElementById('dashboard-view').classList.add('active');
            document.querySelector('[href="#dashboard"]').classList.add('active');
        }

        // Update Header H1 text dynamically
        const pageTitleMap = {
            '': 'Financial Dashboard',
            '#dashboard': 'Financial Dashboard',
            '#transactions': 'Transaction Ledger',
            '#budgets': 'Budget Management',
            '#goals': 'Savings Targets'
        };
        const titleH1 = document.querySelector('.welcome-msg h1');
        if (titleH1 && pageTitleMap[targetHash] !== undefined) {
            titleH1.textContent = pageTitleMap[targetHash];
        }
    }

    // Hash listener
    window.addEventListener('hashchange', () => {
        switchView(window.location.hash);
    });

    // Initial load view check
    switchView(window.location.hash);
}

async function verifyAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
            window.location.href = '/login';
            return;
        }
        state.user = await res.json();
        
        // Update DOM elements
        document.getElementById('user-display-name').textContent = state.user.username;
        document.getElementById('user-avatar').textContent = state.user.username.substring(0, 1).toUpperCase();
        document.getElementById('user-currency-selector').value = state.user.currency;
        
        refreshAllData();
    } catch (err) {
        console.error("Auth check failed:", err);
        window.location.href = '/login';
    }
}

async function handleLogout() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
            window.location.href = '/login';
        } else {
            showToast("Failed to sign out.", "error");
        }
    } catch (err) {
        console.error("Logout error:", err);
        showToast("Error signing out.", "error");
    }
}

async function handleCurrencyChange(newVal) {
    try {
        const res = await fetch('/api/user/currency', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currency: newVal })
        });
        if (res.ok) {
            state.user.currency = newVal;
            showToast(`Currency changed to ${newVal}.`);
            refreshAllData();
        } else {
            showToast("Failed to update currency.", "error");
        }
    } catch (err) {
        console.error("Currency update error:", err);
        showToast("Error updating currency.", "error");
    }
}

// Event Listeners setup
function setupEventListeners() {
    // Backdrop clicks to close modals
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeAllModals();
            }
        });
    });
}

// Set default date for transaction form to today
function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tx-date').value = today;
    document.getElementById('goal-date').value = today;
}

// Global Refresh
async function refreshAllData() {
    try {
        await Promise.all([
            fetchSummary(),
            fetchTransactions(),
            fetchBudgets(),
            fetchGoals()
        ]);
        
        renderDashboard();
        renderTransactionsTable();
        renderBudgets();
        renderGoals();
        updateCharts();
    } catch (error) {
        console.error("Error refreshing dashboard data:", error);
        showToast("Error loading financial data.", "error");
    }
}

// Toast Notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Add appropriate icon depending on type
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove toast after 4s
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// API Functions
async function fetchSummary() {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error("Failed to fetch summary stats");
    state.summary = await res.json();
}

async function fetchTransactions() {
    const res = await fetch('/api/transactions');
    if (!res.ok) throw new Error("Failed to fetch transactions");
    state.transactions = await res.json();
}

async function fetchBudgets() {
    const res = await fetch('/api/budgets');
    if (!res.ok) throw new Error("Failed to fetch budgets");
    state.budgets = await res.json();
}

async function fetchGoals() {
    const res = await fetch('/api/goals');
    if (!res.ok) throw new Error("Failed to fetch savings goals");
    state.goals = await res.json();
}

// Format Currency
function formatCurrency(amount) {
    const currency = state.user?.currency || 'USD';
    const config = CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS['USD'];
    return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.code
    }).format(amount);
}

// Render Dashboard View
function renderDashboard() {
    // 1. KPI Stats Cards
    const balEl = document.getElementById('val-balance');
    const incEl = document.getElementById('val-income');
    const expEl = document.getElementById('val-expense');
    const savEl = document.getElementById('val-savings');
    const savRateEl = document.getElementById('val-savings-rate');

    balEl.textContent = formatCurrency(state.summary.balance);
    incEl.textContent = formatCurrency(state.summary.total_income);
    expEl.textContent = formatCurrency(state.summary.total_expense);
    savEl.textContent = formatCurrency(Math.max(0, state.summary.balance));

    // Calculate Savings Rate
    let rate = 0;
    if (state.summary.total_income > 0) {
        rate = Math.round((state.summary.balance / state.summary.total_income) * 100);
    }
    savRateEl.textContent = `${rate > 0 ? rate : 0}% Savings Rate`;

    // 2. Render Mini Budgets List (Top 3 budgets)
    const miniBudgetsContainer = document.getElementById('mini-budgets-list');
    miniBudgetsContainer.innerHTML = '';
    
    const budgetCategories = Object.keys(state.budgets);
    if (budgetCategories.length === 0) {
        miniBudgetsContainer.innerHTML = '<div class="empty-state">No budgets configured.</div>';
    } else {
        // Calculate category spending from state.transactions
        const spending = {};
        state.transactions.forEach(t => {
            if (t.type === 'expense') {
                spending[t.category] = (spending[t.category] || 0) + t.amount;
            }
        });

        // Show up to 3 budgets
        budgetCategories.slice(0, 3).forEach(cat => {
            const limit = state.budgets[cat];
            const spent = spending[cat] || 0;
            const percent = Math.min(100, (spent / limit) * 100);
            
            // Progress bar color based on percentage
            let barColor = 'var(--secondary)'; // Cyan
            if (percent > 90) barColor = 'var(--danger)'; // Red
            else if (percent > 75) barColor = 'var(--warning)'; // Yellow

            const item = document.createElement('div');
            item.className = 'budget-item';
            item.innerHTML = `
                <div class="budget-info">
                    <span class="budget-name">${cat}</span>
                    <span class="budget-usage">${formatCurrency(spent)} / ${formatCurrency(limit)} (${Math.round((spent/limit)*100)}%)</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percent}%; background-color: ${barColor};"></div>
                </div>
            `;
            miniBudgetsContainer.appendChild(item);
        });
    }

    // 3. Render Mini Goals List (Top 3 active goals)
    const miniGoalsContainer = document.getElementById('mini-goals-list');
    miniGoalsContainer.innerHTML = '';

    if (state.goals.length === 0) {
        miniGoalsContainer.innerHTML = '<div class="empty-state">No savings goals created.</div>';
    } else {
        state.goals.slice(0, 3).forEach(goal => {
            const percent = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
            // SVG dash array calculation (radius of circle is 18, circumference is 2 * PI * r = ~113)
            const circumference = 2 * Math.PI * 18;
            const strokeOffset = circumference - (percent / 100) * circumference;

            const item = document.createElement('div');
            item.className = 'goal-item';
            item.innerHTML = `
                <div class="goal-details">
                    <span class="goal-title">${goal.name}</span>
                    <span class="goal-meta">Target: ${formatCurrency(goal.target_amount)} by ${goal.target_date}</span>
                </div>
                <div class="goal-progress-circle">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                        <circle class="svg-circle-bg" cx="22" cy="22" r="18"/>
                        <circle class="svg-circle-fill" cx="22" cy="22" r="18" 
                                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeOffset}; stroke: ${percent === 100 ? 'var(--accent)' : 'var(--secondary)'}"/>
                    </svg>
                    <span class="goal-progress-percent">${percent}%</span>
                </div>
            `;
            miniGoalsContainer.appendChild(item);
        });
    }
}

// Render Full Budgets Grid
function renderBudgets() {
    const grid = document.getElementById('full-budgets-grid');
    grid.innerHTML = '';

    const budgetCategories = Object.keys(state.budgets);
    if (budgetCategories.length === 0) {
        grid.innerHTML = '<div class="empty-state flex-1" style="grid-column: 1/-1;">No budgets configured. Set category limits to start tracking.</div>';
        return;
    }

    // Calculate category spending from state.transactions
    const spending = {};
    state.transactions.forEach(t => {
        if (t.type === 'expense') {
            spending[t.category] = (spending[t.category] || 0) + t.amount;
        }
    });

    budgetCategories.forEach(cat => {
        const limit = state.budgets[cat];
        const spent = spending[cat] || 0;
        const percent = Math.min(100, (spent / limit) * 100);
        const ratioPercent = Math.round((spent/limit)*100);
        
        let barColor = 'var(--secondary)';
        if (ratioPercent > 100) barColor = 'var(--danger)';
        else if (ratioPercent > 80) barColor = 'var(--warning)';
        
        const card = document.createElement('div');
        card.className = 'card budget-card-full';
        card.innerHTML = `
            <div class="budget-card-header">
                <h3>${cat}</h3>
                <button class="delete-btn" onclick="deleteBudget('${cat}')" title="Delete budget">&times;</button>
            </div>
            <div class="budget-card-limits">
                <span>Spent: <strong>${formatCurrency(spent)}</strong></span>
                <span>Limit: <strong>${formatCurrency(limit)}</strong></span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percent}%; background-color: ${barColor};"></div>
            </div>
            <div style="font-size: 0.8rem; text-align: right; color: ${ratioPercent > 100 ? 'var(--danger)' : 'var(--text-secondary)'}">
                ${ratioPercent > 100 ? 'Over limit by ' + formatCurrency(spent-limit) : ratioPercent + '% Used'}
            </div>
        `;
        grid.appendChild(card);
    });
}

// Render Full Goals Grid
function renderGoals() {
    const grid = document.getElementById('full-goals-grid');
    grid.innerHTML = '';

    if (state.goals.length === 0) {
        grid.innerHTML = '<div class="empty-state flex-1" style="grid-column: 1/-1;">No active savings targets found. Create one now!</div>';
        return;
    }

    state.goals.forEach(goal => {
        const percent = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
        const circumference = 2 * Math.PI * 18;
        const strokeOffset = circumference - (percent / 100) * circumference;

        const card = document.createElement('div');
        card.className = 'card goal-card-full';
        card.innerHTML = `
            <div class="goal-card-header">
                <div>
                    <h3 class="goal-card-title">${goal.name}</h3>
                    <div class="goal-card-date">Target Date: ${goal.target_date}</div>
                </div>
                <div class="goal-card-actions">
                    <button class="action-btn action-btn-edit" onclick="editGoal(${goal.id})" title="Edit Goal">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="action-btn action-btn-delete" onclick="deleteGoal(${goal.id})" title="Delete Goal">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <div class="goal-card-stats">
                <span>Saved: <strong>${formatCurrency(goal.current_amount)}</strong></span>
                <span>Target: <strong>${formatCurrency(goal.target_amount)}</strong></span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.8rem; color: var(--text-secondary);">${percent}% Saved</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${formatCurrency(Math.max(0, goal.target_amount - goal.current_amount))} left</span>
            </div>
            <div class="progress-bar-bg" style="height: 6px;">
                <div class="progress-bar-fill" style="width: ${percent}%; background-color: ${percent === 100 ? 'var(--accent)' : 'var(--secondary)'};"></div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Render Transactions Ledger Table
function renderTransactionsTable() {
    const list = document.getElementById('transactions-list');
    list.innerHTML = '';

    // Apply filters
    let filtered = state.transactions.filter(tx => {
        // Search filter
        const matchSearch = tx.description.toLowerCase().includes(state.filters.search.toLowerCase()) || 
                            tx.category.toLowerCase().includes(state.filters.search.toLowerCase());
        
        // Type filter
        const matchType = state.filters.type === 'all' || tx.type === state.filters.type;
        
        // Category filter
        const matchCategory = state.filters.category === 'all' || tx.category === state.filters.category;
        
        return matchSearch && matchType && matchCategory;
    });

    // Apply Sorting
    filtered.sort((a, b) => {
        let valA = a[state.sort.key];
        let valB = b[state.sort.key];
        
        // Number conversions for comparisons
        if (state.sort.key === 'amount') {
            valA = parseFloat(valA);
            valB = parseFloat(valB);
        } else if (state.sort.key === 'id') {
            valA = parseInt(valA);
            valB = parseInt(valB);
        }

        if (valA < valB) return state.sort.asc ? -1 : 1;
        if (valA > valB) return state.sort.asc ? 1 : -1;
        return 0;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    No transactions match the selected filters.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(tx => {
        const tr = document.createElement('tr');
        const badgeClass = CATEGORY_MAP[tx.category]?.badge || 'badge-others';
        const typeClass = tx.type === 'income' ? 'text-income' : 'text-expense';
        const amountPrefix = tx.type === 'income' ? '+' : '-';

        tr.innerHTML = `
            <td>${tx.date}</td>
            <td style="font-weight: 500;">${tx.description}</td>
            <td><span class="badge ${badgeClass}">${tx.category}</span></td>
            <td><span style="text-transform: capitalize; font-size: 0.85rem;" class="${typeClass}">${tx.type}</span></td>
            <td class="tx-amount-col ${typeClass}" style="text-align: right;">${amountPrefix}${formatCurrency(tx.amount)}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn action-btn-edit" onclick="editTransaction(${tx.id})" title="Edit Transaction">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="action-btn action-btn-delete" onclick="deleteTransaction(${tx.id})" title="Delete Transaction">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </td>
        `;
        list.appendChild(tr);
    });
}

// Filter Transactions callback
function filterTransactions() {
    state.filters.search = document.getElementById('tx-search').value;
    state.filters.type = document.getElementById('filter-type').value;
    state.filters.category = document.getElementById('filter-category').value;
    renderTransactionsTable();
}

// Sort Transactions toggle
function sortTransactions(key) {
    if (state.sort.key === key) {
        state.sort.asc = !state.sort.asc;
    } else {
        state.sort.key = key;
        state.sort.asc = true;
    }
    
    // Update header icons
    const icons = {
        date: document.getElementById('sort-date-icon'),
        description: document.getElementById('sort-desc-icon'),
        category: document.getElementById('sort-cat-icon'),
        type: document.getElementById('sort-type-icon'),
        amount: document.getElementById('sort-amt-icon')
    };

    Object.keys(icons).forEach(k => {
        if (icons[k]) {
            if (k === key) {
                icons[k].textContent = state.sort.asc ? ' ▲' : ' ▼';
            } else {
                icons[k].textContent = '';
            }
        }
    });

    renderTransactionsTable();
}

// Chart.js Orchestrator
function updateCharts() {
    const expenseData = state.summary.expense_by_category;
    const monthlyTrends = state.summary.monthly_trends;

    // 1. Expense Category Doughnut Chart
    const categoryCanvas = document.getElementById('categoryChart');
    if (categoryCanvas) {
        const labels = Object.keys(expenseData);
        const dataValues = Object.values(expenseData);
        const backgroundColors = labels.map(label => CATEGORY_MAP[label]?.color || '#64748b');

        if (categoryChartInstance) {
            categoryChartInstance.destroy();
        }

        if (labels.length === 0) {
            // Draw empty state chart or handle
            categoryChartInstance = new Chart(categoryCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['rgba(255,255,255,0.05)'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: '#94a3b8' } },
                        tooltip: { enabled: false }
                    }
                }
            });
        } else {
            categoryChartInstance = new Chart(categoryCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 1,
                        borderColor: '#0f0a28'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#94a3b8',
                                font: { family: 'Outfit', size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.label}: ${formatCurrency(context.raw)}`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }

    // 2. Monthly Trends Bar Chart
    const trendCanvas = document.getElementById('trendChart');
    if (trendCanvas) {
        const months = monthlyTrends.map(t => {
            const [year, month] = t.month.split('-');
            const dateObj = new Date(year, month - 1);
            return dateObj.toLocaleString('en-US', { month: 'short', year: '2-digit' });
        });
        const incomeValues = monthlyTrends.map(t => t.income);
        const expenseValues = monthlyTrends.map(t => t.expense);

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        trendChartInstance = new Chart(trendCanvas, {
            type: 'bar',
            data: {
                labels: months.length > 0 ? months : ['No Data'],
                datasets: [
                    {
                        label: 'Income',
                        data: incomeValues.length > 0 ? incomeValues : [0],
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    },
                    {
                        label: 'Expenses',
                        data: expenseValues.length > 0 ? expenseValues : [0],
                        backgroundColor: '#f43f5e',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { 
                            color: '#94a3b8', 
                            font: { family: 'Outfit' },
                            callback: function(value) {
                                const currency = state.user?.currency || 'USD';
                                const symbol = CURRENCY_CONFIGS[currency]?.symbol || '$';
                                return symbol + value;
                            }
                        }
                    }
                }
            }
        });
    }
}

// Modal Handlers
function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.remove('active'));
}

// Transaction Modal Trigger
function openTransactionModal(editId = null) {
    const modal = document.getElementById('tx-modal');
    const title = document.getElementById('tx-modal-title');
    const form = document.getElementById('tx-form');
    
    form.reset();
    setDefaultDates();
    
    if (editId) {
        title.textContent = 'Edit Transaction';
        const tx = state.transactions.find(t => t.id === editId);
        if (tx) {
            document.getElementById('tx-id').value = tx.id;
            
            // Set type
            const typeRadio = form.querySelector(`input[name="tx_type"][value="${tx.type}"]`);
            if (typeRadio) {
                typeRadio.checked = true;
                updateTypeSelection();
            }
            
            document.getElementById('tx-amount').value = tx.amount;
            document.getElementById('tx-date').value = tx.date;
            document.getElementById('tx-category').value = tx.category;
            document.getElementById('tx-description').value = tx.description;
        }
    } else {
        title.textContent = 'Add Transaction';
        document.getElementById('tx-id').value = '';
        // Select expense by default
        form.querySelector('input[name="tx_type"][value="expense"]').checked = true;
        updateTypeSelection();
    }
    
    modal.classList.add('active');
}

function closeTransactionModal() {
    document.getElementById('tx-modal').classList.remove('active');
}

// Sync Form Category options depending on Type (Expense vs Income)
function updateTypeSelection() {
    const activeType = document.querySelector('input[name="tx_type"]:checked').value;
    const catSelect = document.getElementById('tx-category');
    
    // Toggle active classes on selector labels
    const expLabel = document.getElementById('btn-type-expense');
    const incLabel = document.getElementById('btn-type-income');
    
    if (activeType === 'expense') {
        expLabel.classList.add('active');
        incLabel.classList.remove('active');
        populateCategories(EXPENSE_CATEGORIES);
    } else {
        incLabel.classList.add('active');
        expLabel.classList.remove('active');
        populateCategories(INCOME_CATEGORIES);
    }
}

function populateCategories(categories) {
    const select = document.getElementById('tx-category');
    select.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
}

// Save/Update Transaction
async function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('tx-id').value;
    const payload = {
        type: document.querySelector('input[name="tx_type"]:checked').value,
        amount: parseFloat(document.getElementById('tx-amount').value),
        category: document.getElementById('tx-category').value,
        date: document.getElementById('tx-date').value,
        description: document.getElementById('tx-description').value
    };

    try {
        let res;
        if (id) {
            // Update
            res = await fetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create
            res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();
        if (res.ok) {
            closeTransactionModal();
            showToast(id ? "Transaction updated." : "Transaction added.");
            refreshAllData();
        } else {
            showToast(data.error || "Failed to save transaction.", "error");
        }
    } catch (error) {
        console.error("Error saving transaction:", error);
        showToast("Server error saving transaction.", "error");
    }
}

// Trigger edit on table transaction
function editTransaction(id) {
    openTransactionModal(id);
}

// Delete Transaction
async function deleteTransaction(id) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
        const res = await fetch(`/api/transactions/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
            showToast("Transaction deleted.");
            refreshAllData();
        } else {
            showToast(data.error || "Failed to delete transaction.", "error");
        }
    } catch (error) {
        console.error("Error deleting transaction:", error);
        showToast("Server error deleting transaction.", "error");
    }
}

// Budget Modal Handlers
function openBudgetModal() {
    const modal = document.getElementById('budget-modal');
    document.getElementById('budget-form').reset();
    modal.classList.add('active');
}

function closeBudgetModal() {
    document.getElementById('budget-modal').classList.remove('active');
}

// Save Budget
async function saveBudget(e) {
    e.preventDefault();
    const payload = {
        category: document.getElementById('budget-category').value,
        amount: parseFloat(document.getElementById('budget-amount').value)
    };

    try {
        const res = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            closeBudgetModal();
            showToast(`Budget for ${payload.category} set.`);
            refreshAllData();
        } else {
            showToast(data.error || "Failed to set budget.", "error");
        }
    } catch (error) {
        console.error("Error saving budget:", error);
        showToast("Server error saving budget.", "error");
    }
}

// Delete Budget
async function deleteBudget(category) {
    if (!confirm(`Are you sure you want to delete the budget for ${category}?`)) return;

    try {
        const res = await fetch(`/api/budgets/${category}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Budget for ${category} removed.`);
            refreshAllData();
        } else {
            showToast(data.error || "Failed to delete budget.", "error");
        }
    } catch (error) {
        console.error("Error deleting budget:", error);
        showToast("Server error deleting budget.", "error");
    }
}

// Goals Modal Handlers
function openGoalModal(editId = null) {
    const modal = document.getElementById('goal-modal');
    const title = document.getElementById('goal-modal-title');
    const form = document.getElementById('goal-form');
    
    form.reset();
    setDefaultDates();

    if (editId) {
        title.textContent = 'Edit Savings Goal';
        const goal = state.goals.find(g => g.id === editId);
        if (goal) {
            document.getElementById('goal-id').value = goal.id;
            document.getElementById('goal-name').value = goal.name;
            document.getElementById('goal-target').value = goal.target_amount;
            document.getElementById('goal-current').value = goal.current_amount;
            document.getElementById('goal-date').value = goal.target_date;
        }
    } else {
        title.textContent = 'Create Savings Goal';
        document.getElementById('goal-id').value = '';
    }

    modal.classList.add('active');
}

function closeGoalModal() {
    document.getElementById('goal-modal').classList.remove('active');
}

// Save/Update Goal
async function saveGoal(e) {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const payload = {
        name: document.getElementById('goal-name').value,
        target_amount: parseFloat(document.getElementById('goal-target').value),
        current_amount: parseFloat(document.getElementById('goal-current').value || 0),
        target_date: document.getElementById('goal-date').value
    };

    try {
        let res;
        if (id) {
            res = await fetch(`/api/goals/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();
        if (res.ok) {
            closeGoalModal();
            showToast(id ? "Goal updated." : "Goal created.");
            refreshAllData();
        } else {
            showToast(data.error || "Failed to save savings goal.", "error");
        }
    } catch (error) {
        console.error("Error saving savings goal:", error);
        showToast("Server error saving goal.", "error");
    }
}

// Trigger edit savings goal
function editGoal(id) {
    openGoalModal(id);
}

// Delete Goal
async function deleteGoal(id) {
    if (!confirm("Are you sure you want to delete this savings goal?")) return;

    try {
        const res = await fetch(`/api/goals/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (res.ok) {
            showToast("Savings goal deleted.");
            refreshAllData();
        } else {
            showToast(data.error || "Failed to delete goal.", "error");
        }
    } catch (error) {
        console.error("Error deleting goal:", error);
        showToast("Server error deleting goal.", "error");
    }
}
