import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  PackagePlus,
  Boxes,
  Wallet,
  ClipboardList,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Minus,
  RotateCcw,
  Receipt,
  Edit3,
  ShieldCheck,
  LogOut,
  Lock,
  UserCheck
} from 'lucide-react';
import {
  getSession,
  clearSession,
  loginUser,
  registerUser,
  fetchInitialState,
  resetAllDemoData,
  executeTransaction1CheckoutSale,
  executeTransaction2UpsertProduct,
  executeTransaction3StockMovement,
  executeTransaction4CustomerWallet,
  executeTransaction5OrderStatusOrRefund,
  executeTransaction6CashRegisterOperation
} from './services/api';

const CATEGORIES = ['Todos', 'Salgados', 'Lanches & Tapiocas', 'Bebidas', 'Doces & Açaí', 'Combos'];
const EMOJI_OPTIONS = ['🍗', '🥟', '🧀', '🌮', '🥪', '🧃', '☕', '🥤', '🍨', '🍱', '🍔', '🍕', '🥐', '🍰'];

export default function App() {
  const [session, setSession] = useState(getSession);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'OPERADOR'
  });

  const [activeTab, setActiveTab] = useState('tx1');
  const [appState, setAppState] = useState({
    products: [],
    customers: [],
    orders: [],
    stockMovements: [],
    cashMovements: [],
    cashStatus: { isOpen: true, operator: 'Operador Caixa 01' }
  });
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  // Estado Transação 1: Venda PDV
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [discountInput, setDiscountInput] = useState('');
  const [cashReceivedInput, setCashReceivedInput] = useState('');

  // Estado Transação 2: Cadastro/Edição de Produto
  const [productForm, setProductForm] = useState({
    id: '',
    sku: '',
    name: '',
    category: 'Salgados',
    price: '',
    cost: '',
    stock: '20',
    minStock: '8',
    emoji: '🍗'
  });

  // Estado Transação 3: Reposição/Baixa de Estoque
  const [stockForm, setStockForm] = useState({
    productId: 'PROD-001',
    type: 'ENTRADA',
    quantity: '15',
    reason: 'Reposição fornecedor / Cozinha central'
  });

  // Estado Transação 4: Cadastro de Cliente e Recarga Carteira Unifor
  const [customerForm, setCustomerForm] = useState({
    name: '',
    matricula: '',
    course: 'Ciência da Computação - CCT',
    role: 'Aluno',
    initialDeposit: '25',
    paymentMethod: 'PIX'
  });
  const [walletTopupForm, setWalletTopupForm] = useState({
    customerId: 'CLI-001',
    amount: '20',
    paymentMethod: 'PIX'
  });

  // Estado Transação 6: Operações de Caixa
  const [cashOpForm, setCashOpForm] = useState({
    operationType: 'SUPRIMENTO',
    amount: '50',
    description: 'Reforço de cédulas para troco',
    operator: 'Operador Caixa 01'
  });

  useEffect(() => {
    if (!session) return;
    fetchInitialState()
      .then((data) => {
        setAppState(data);
        setCashOpForm((prev) => ({ ...prev, operator: session.user.name }));
      })
      .catch((err) => {
        if (err.status === 401) {
          clearSession();
          setSession(null);
        }
      });
  }, [session]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await loginUser(loginForm);
      setSession({
        token: res.token,
        user: res.user,
        isLocalFallback: Boolean(res.isLocalFallback)
      });
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await registerUser(registerForm);
      setSession({
        token: res.token,
        user: res.user,
        isLocalFallback: Boolean(res.isLocalFallback)
      });
      setRegisterForm({ name: '', email: '', password: '', role: 'OPERADOR' });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setCart([]);
    setBanner(null);
  };

  const handleResetDemo = async () => {
    setLoading(true);
    try {
      const res = await resetAllDemoData();
      setAppState(res.state);
      setCart([]);
      notify('success', res.summary || 'Dados de demonstração restaurados com sucesso!');
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = session?.user?.role === 'ADMIN';

  const notify = (type, message) => {
    setBanner({ type, message });
    setTimeout(() => {
      setBanner((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  };

  // KPIs Calculados
  const metrics = useMemo(() => {
    const validOrders = appState.orders.filter((o) => o.status !== 'Cancelado/Estornado');
    const revenueToday = validOrders.reduce((acc, o) => acc + o.total, 0);
    const activeKitchenCount = appState.orders.filter(
      (o) => o.status === 'Em Preparo' || o.status === 'Pronto para Retirada'
    ).length;
    const lowStockProducts = appState.products.filter((p) => p.stock <= p.minStock);
    const cashBalance = appState.cashMovements.reduce((acc, m) => acc + Number(m.amount || 0), 0);

    return {
      revenueToday,
      ordersCount: validOrders.length,
      activeKitchenCount,
      lowStockCount: lowStockProducts.length,
      cashBalance
    };
  }, [appState]);

  // Produtos filtrados para o PDV
  const filteredProducts = useMemo(() => {
    return appState.products.filter((p) => {
      const matchesCat = selectedCategory === 'Todos' || p.category === selectedCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [appState.products, selectedCategory, searchQuery]);

  // Totais do Carrinho
  const cartSubtotal = useMemo(
    () => Number(cart.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2)),
    [cart]
  );
  const cartDiscount = useMemo(
    () => Math.min(Math.max(0, Number(discountInput) || 0), cartSubtotal),
    [discountInput, cartSubtotal]
  );
  const cartTotal = useMemo(
    () => Number((cartSubtotal - cartDiscount).toFixed(2)),
    [cartSubtotal, cartDiscount]
  );

  // Funções do Carrinho (Transação 1)
  const addToCart = (product) => {
    if (product.stock <= 0) {
      notify('error', `O item "${product.name}" está sem estoque disponível.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) {
          notify('error', `Limite de estoque atingido para "${product.name}" (${product.stock} un.).`);
          return prev;
        }
        return prev.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          emoji: product.emoji,
          qty: 1
        }
      ];
    });
  };

  const updateCartQty = (productId, delta) => {
    const product = appState.products.find((p) => p.id === productId);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = item.qty + delta;
          if (product && nextQty > product.stock) {
            notify('error', `Estoque máximo disponível: ${product.stock} un.`);
            return item;
          }
          return { ...item, qty: nextQty };
        })
        .filter((item) => item.qty > 0)
    );
  };

  // Handler Transação 1: Finalizar Venda no PDV
  const handleCheckoutSale = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction1CheckoutSale({
        items: cart,
        customerId: selectedCustomerId || null,
        paymentMethod,
        discount: cartDiscount,
        cashReceived: Number(cashReceivedInput) || cartTotal
      });
      setAppState(res.state);
      setCart([]);
      setDiscountInput('');
      setCashReceivedInput('');
      setLastReceipt(res.order);
      notify('success', `[Transação 1 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 2: Salvar Produto
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction2UpsertProduct(productForm);
      setAppState(res.state);
      setProductForm({
        id: '',
        sku: '',
        name: '',
        category: 'Salgados',
        price: '',
        cost: '',
        stock: '20',
        minStock: '8',
        emoji: '🍗'
      });
      notify('success', `[Transação 2 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 3: Movimentar Estoque
  const handleStockMovement = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction3StockMovement(stockForm);
      setAppState(res.state);
      setStockForm((prev) => ({ ...prev, quantity: '10', reason: '' }));
      notify('success', `[Transação 3 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 4A: Cadastrar Cliente Unifor
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction4CustomerWallet({
        actionType: 'CREATE_CUSTOMER',
        ...customerForm
      });
      setAppState(res.state);
      setCustomerForm({
        name: '',
        matricula: '',
        course: 'Ciência da Computação - CCT',
        role: 'Aluno',
        initialDeposit: '20',
        paymentMethod: 'PIX'
      });
      notify('success', `[Transação 4 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 4B: Recarregar Carteira Unifor
  const handleTopupWallet = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction4CustomerWallet({
        actionType: 'TOPUP_WALLET',
        ...walletTopupForm
      });
      setAppState(res.state);
      notify('success', `[Transação 4 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 5: Atualizar Status do Pedido ou Estornar
  const handleOrderStatusChange = async (orderId, newStatus) => {
    let reason = '';
    if (newStatus === 'Cancelado/Estornado') {
      reason = window.prompt(
        'Informe o motivo do cancelamento/estorno (o estoque e saldo serão devolvidos):',
        'Solicitação do cliente no balcão'
      );
      if (reason === null) return;
    }
    setLoading(true);
    try {
      const res = await executeTransaction5OrderStatusOrRefund({
        orderId,
        newStatus,
        reason
      });
      setAppState(res.state);
      notify('success', `[Transação 5 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler Transação 6: Operação de Caixa
  const handleCashOperation = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await executeTransaction6CashRegisterOperation(cashOpForm);
      setAppState(res.state);
      setCashOpForm((prev) => ({ ...prev, amount: '50', description: '' }));
      notify('success', `[Transação 6 Concluída] ${res.summary}`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // TELA DE CONTROLE DE ACESSO (AUTENTICAÇÃO E AUTORIZAÇÃO)
  // =========================================================================
  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">🎓</div>
            <h1>Cantina Unifor • PDV</h1>
            <p>Controle de Acesso • Autenticação JWT & Autorização por Perfil (RBAC)</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              Entrar no Sistema
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
            >
              Criar Conta
            </button>
          </div>

          {authError && (
            <div className="toast-banner error" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} />
                {authError}
              </span>
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label>E-mail institucional</label>
                <input
                  type="email"
                  required
                  className="form-control"
                  placeholder="admin@unifor.br ou caixa@unifor.br"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Senha</label>
                <input
                  type="password"
                  required
                  className="form-control"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary" disabled={authLoading}>
                <ShieldCheck size={18} />
                {authLoading ? 'Autenticando...' : 'Entrar no PDV'}
              </button>

              <div className="demo-accounts-box">
                <p>Perfis de Demonstração (Clique para preencher)</p>
                <div className="demo-accounts-grid">
                  <button
                    type="button"
                    className="demo-acc-btn"
                    onClick={() =>
                      setLoginForm({ email: 'admin@unifor.br', password: 'admin123' })
                    }
                  >
                    <strong>Gerente (ADMIN)</strong>
                    <span>Acesso total (T1 a T6)</span>
                  </button>
                  <button
                    type="button"
                    className="demo-acc-btn"
                    onClick={() =>
                      setLoginForm({ email: 'caixa@unifor.br', password: 'caixa123' })
                    }
                  >
                    <strong>Caixa (OPERADOR)</strong>
                    <span>Vendas, recarga e fila</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group">
                <label>Nome Completo</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  placeholder="Ex: Maria Fernanda"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>E-mail</label>
                <input
                  type="email"
                  required
                  className="form-control"
                  placeholder="usuario@unifor.br"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label>Senha (mín. 6 caract.)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="form-control"
                    placeholder="••••••"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, password: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Perfil de Acesso</label>
                  <select
                    className="form-control"
                    value={registerForm.role}
                    onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
                  >
                    <option value="OPERADOR">OPERADOR (Caixa)</option>
                    <option value="ADMIN">ADMIN (Gerente)</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={authLoading}>
                <UserCheck size={18} />
                {authLoading ? 'Cadastrando...' : 'Criar Conta e Entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* TOPO INSTITUCIONAL UNIFOR */}
      <header className="top-header">
        <div className="brand-group">
          <div className="brand-logo">🎓</div>
          <div className="brand-title">
            <h1>Cantina Unifor • Sistema de Ponto de Venda (PDV)</h1>
            <p>
              Gestão de Vendas, Cardápio, Estoque, Carteira Universitária, Fila da Cozinha e Caixa
            </p>
          </div>
        </div>

        <div className="header-badges">
          <div className="status-pill">
            <span className={`dot ${appState.cashStatus.isOpen ? 'open' : 'closed'}`} />
            <span>
              Caixa: <strong>{appState.cashStatus.isOpen ? 'ABERTO' : 'FECHADO'}</strong>
            </span>
          </div>

          <div className="status-pill">
            <ShieldCheck size={15} />
            <span>{session.user.name}</span>
            <span className={`role-badge ${isAdmin ? 'admin' : 'operador'}`}>
              {session.user.role}
            </span>
          </div>

          {isAdmin && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.36rem 0.7rem', fontSize: '0.75rem' }}
              onClick={handleResetDemo}
              disabled={loading}
            >
              <RotateCcw size={14} /> Restaurar Dados Demo
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '0.36rem 0.7rem', fontSize: '0.75rem' }}
            onClick={handleLogout}
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </header>

      {/* NAVEGAÇÃO DAS 6 TRANSAÇÕES OBRIGATÓRIAS */}
      <nav className="tx-nav-bar" aria-label="Transações do Sistema">
        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx1' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx1')}
        >
          <span className="tx-badge-num">T1</span>
          <ShoppingCart size={16} />
          <span>Venda no PDV (Checkout)</span>
        </button>

        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx2' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx2')}
        >
          <span className="tx-badge-num">T2</span>
          <PackagePlus size={16} />
          <span>Cadastro de Produtos</span>
        </button>

        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx3' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx3')}
        >
          <span className="tx-badge-num">T3</span>
          <Boxes size={16} />
          <span>Reposição de Estoque</span>
        </button>

        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx4' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx4')}
        >
          <span className="tx-badge-num">T4</span>
          <Wallet size={16} />
          <span>Carteira Aluno / Recarga</span>
        </button>

        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx5' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx5')}
        >
          <span className="tx-badge-num">T5</span>
          <ClipboardList size={16} />
          <span>Fila de Pedidos & Estorno ({metrics.activeKitchenCount})</span>
        </button>

        <button
          type="button"
          className={`tx-tab-btn ${activeTab === 'tx6' ? 'active' : ''}`}
          onClick={() => setActiveTab('tx6')}
        >
          <span className="tx-badge-num">T6</span>
          <Landmark size={16} />
          <span>Fluxo de Caixa & Turno</span>
        </button>
      </nav>

      {/* FAIXA DE INDICADORES EM TEMPO REAL */}
      <section className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-info">
            <span>Faturamento de Vendas</span>
            <h3>R$ {metrics.revenueToday.toFixed(2)}</h3>
            <small>{metrics.ordersCount} pedidos válidos no turno</small>
          </div>
          <div className="kpi-icon">
            <ShoppingCart size={20} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span>Fila da Cozinha</span>
            <h3>{metrics.activeKitchenCount} pedidos</h3>
            <small>Em preparo ou aguardando retirada</small>
          </div>
          <div className="kpi-icon">
            <ClipboardList size={20} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span>Alertas de Estoque</span>
            <h3>{metrics.lowStockCount} itens</h3>
            <small>Abaixo do estoque mínimo</small>
          </div>
          <div className="kpi-icon" style={{ color: metrics.lowStockCount > 0 ? '#d97706' : '#0046ad' }}>
            <Boxes size={20} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span>Saldo Consolidado Caixa</span>
            <h3>R$ {metrics.cashBalance.toFixed(2)}</h3>
            <small>Fundo + Vendas + Recargas - Sangrias</small>
          </div>
          <div className="kpi-icon">
            <Landmark size={20} />
          </div>
        </div>
      </section>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="main-container">
        {banner && (
          <div className={`toast-banner ${banner.type}`}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {banner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              {banner.message}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 1: REALIZAR VENDA NO PDV (CHECKOUT DE PEDIDO)
            =================================================================== */}
        {activeTab === 'tx1' && (
          <div className="pos-grid">
            {/* Catálogo de Produtos */}
            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <span className="tx-tag">TRANSAÇÃO 1</span>
                  <h2>Cardápio Digital da Cantina Unifor</h2>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Clique em um item para adicionar ao pedido
                </span>
              </div>

              <div className="panel-body">
                <div className="filter-bar">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Buscar por nome do lanche, bebida ou código SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`cat-chip ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="product-catalog-grid">
                  {filteredProducts.map((product) => {
                    const isLow = product.stock > 0 && product.stock <= product.minStock;
                    const isZero = product.stock <= 0;
                    return (
                      <div
                        key={product.id}
                        className={`product-item-card ${isZero ? 'out-of-stock' : ''}`}
                        onClick={() => !isZero && addToCart(product)}
                      >
                        <div className="product-top">
                          <div className="product-emoji">{product.emoji}</div>
                          <span
                            className={`stock-badge ${isZero ? 'zero' : isLow ? 'low' : ''}`}
                          >
                            {isZero ? 'Esgotado' : `${product.stock} un.`}
                          </span>
                        </div>

                        <div>
                          <div className="product-sku">{product.sku} • {product.category}</div>
                          <div className="product-name">{product.name}</div>
                        </div>

                        <div className="product-bottom">
                          <span className="product-price">R$ {product.price.toFixed(2)}</span>
                          <button type="button" className="add-mini-btn" disabled={isZero}>
                            + Adicionar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Painel de Checkout do Pedido */}
            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <ShoppingCart size={18} color="#0046ad" />
                  <h2>Frente de Caixa (Checkout)</h2>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => setCart([])}
                  >
                    Limpar
                  </button>
                )}
              </div>

              <form className="panel-body" onSubmit={handleCheckoutSale}>
                <div className="cart-items-list">
                  {cart.length === 0 ? (
                    <div className="cart-empty">
                      Nenhum item no pedido.<br />
                      Selecione lanches ou bebidas no cardápio ao lado.
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.productId} className="cart-row">
                        <div className="cart-row-info">
                          <h4>{item.emoji} {item.name}</h4>
                          <span>
                            R$ {item.price.toFixed(2)} x {item.qty} ={' '}
                            <strong>R$ {(item.price * item.qty).toFixed(2)}</strong>
                          </span>
                        </div>
                        <div className="qty-controls">
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => updateCartQty(item.productId, -1)}
                          >
                            <Minus size={12} />
                          </button>
                          <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => updateCartQty(item.productId, 1)}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="form-group">
                  <label>Aluno / Professor (Opcional — Obrigatório p/ Carteira Unifor)</label>
                  <select
                    className="form-control"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Cliente Balcão (Sem vínculo de matrícula)</option>
                    {appState.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} • Mat: {c.matricula} (Saldo: R$ {c.balance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Forma de Pagamento</label>
                    <select
                      className="form-control"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="PIX">PIX Instantâneo</option>
                      <option value="Carteira Unifor">Carteira Unifor (Saldo Aluno)</option>
                      <option value="Cartão Débito/Crédito">Cartão Débito / Crédito</option>
                      <option value="Dinheiro">Dinheiro em Espécie</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Desconto (R$)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      className="form-control"
                      placeholder="0.00"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                    />
                  </div>
                </div>

                {paymentMethod === 'Dinheiro' && (
                  <div className="form-group">
                    <label>Valor Recebido em Dinheiro (R$) — Cálculo de Troco</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      className="form-control"
                      placeholder={cartTotal.toFixed(2)}
                      value={cashReceivedInput}
                      onChange={(e) => setCashReceivedInput(e.target.value)}
                    />
                  </div>
                )}

                <div className="summary-box">
                  <div className="summary-line">
                    <span>Subtotal ({cart.reduce((a, b) => a + b.qty, 0)} itens)</span>
                    <span>R$ {cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="summary-line">
                    <span>Desconto aplicado</span>
                    <span>- R$ {cartDiscount.toFixed(2)}</span>
                  </div>
                  {paymentMethod === 'Dinheiro' && Number(cashReceivedInput) > cartTotal && (
                    <div className="summary-line" style={{ color: '#047857', fontWeight: 700 }}>
                      <span>Troco a devolver</span>
                      <span>R$ {(Number(cashReceivedInput) - cartTotal).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="summary-line total">
                    <span>TOTAL A PAGAR</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || cart.length === 0}
                >
                  <CheckCircle2 size={18} />
                  {loading ? 'Processando venda...' : 'Finalizar Venda e Emitir Ficha (T1)'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 2: CADASTRAR E EDITAR PRODUTO DO CARDÁPIO
            =================================================================== */}
        {activeTab === 'tx2' && (
          <div className="two-col-section">
            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <span className="tx-tag">TRANSAÇÃO 2</span>
                  <h2>{productForm.id ? 'Editar Produto' : 'Novo Produto no Cardápio'}</h2>
                </div>
              </div>

              <form className="panel-body" onSubmit={handleSaveProduct}>
                {!isAdmin && (
                  <div className="rbac-notice">
                    <Lock size={16} />
                    <span>
                      Autorização RBAC: cadastro e edição de produtos exigem perfil <strong>ADMIN</strong>.
                    </span>
                  </div>
                )}
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 90px' }}>
                  <div className="form-group">
                    <label>Código SKU</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      placeholder="Ex: SALG-09"
                      value={productForm.sku}
                      onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Ícone</label>
                    <select
                      className="form-control"
                      value={productForm.emoji}
                      onChange={(e) => setProductForm({ ...productForm, emoji: e.target.value })}
                    >
                      {EMOJI_OPTIONS.map((em) => (
                        <option key={em} value={em}>
                          {em}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Nome do Produto</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ex: Empada de Camarão Cremoso"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Categoria do Cardápio</label>
                  <select
                    className="form-control"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  >
                    {CATEGORIES.filter((c) => c !== 'Todos').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Preço de Venda (R$)</label>
                    <input
                      type="number"
                      step="0.10"
                      required
                      className="form-control"
                      placeholder="9.50"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Custo Unitário (R$)</label>
                    <input
                      type="number"
                      step="0.10"
                      required
                      className="form-control"
                      placeholder="4.20"
                      value={productForm.cost}
                      onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Estoque Inicial (Un.)</label>
                    <input
                      type="number"
                      required
                      className="form-control"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Estoque Mínimo Alerta</label>
                    <input
                      type="number"
                      required
                      className="form-control"
                      value={productForm.minStock}
                      onChange={(e) => setProductForm({ ...productForm, minStock: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={loading}>
                  <PackagePlus size={18} />
                  {productForm.id
                    ? 'Salvar Alterações do Produto (T2)'
                    : 'Cadastrar Produto no Cardápio (T2)'}
                </button>

                {productForm.id && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}
                    onClick={() =>
                      setProductForm({
                        id: '',
                        sku: '',
                        name: '',
                        category: 'Salgados',
                        price: '',
                        cost: '',
                        stock: '20',
                        minStock: '8',
                        emoji: '🍗'
                      })
                    }
                  >
                    Cancelar Edição
                  </button>
                )}
              </form>
            </div>

            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <h2>Itens Cadastrados no Cardápio ({appState.products.length})</h2>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Preço Venda</th>
                      <th>Custo / Margem</th>
                      <th>Estoque</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appState.products.map((p) => {
                      const margin =
                        p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                      return (
                        <tr key={p.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.sku}</td>
                          <td>
                            <strong>
                              {p.emoji} {p.name}
                            </strong>
                          </td>
                          <td>{p.category}</td>
                          <td style={{ fontWeight: 700, color: '#0046ad' }}>
                            R$ {p.price.toFixed(2)}
                          </td>
                          <td>
                            R$ {p.cost.toFixed(2)} <small>({margin}%)</small>
                          </td>
                          <td>
                            <span
                              className={`stock-badge ${
                                p.stock <= 0 ? 'zero' : p.stock <= p.minStock ? 'low' : ''
                              }`}
                            >
                              {p.stock} un. (mín {p.minStock})
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                setProductForm({
                                  id: p.id,
                                  sku: p.sku,
                                  name: p.name,
                                  category: p.category,
                                  price: String(p.price),
                                  cost: String(p.cost),
                                  stock: String(p.stock),
                                  minStock: String(p.minStock),
                                  emoji: p.emoji
                                })
                              }
                            >
                              <Edit3 size={14} /> Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 3: REPOSIÇÃO E BAIXA DE ESTOQUE (MOVIMENTAÇÃO DE INSUMOS)
            =================================================================== */}
        {activeTab === 'tx3' && (
          <div className="two-col-section">
            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <span className="tx-tag">TRANSAÇÃO 3</span>
                  <h2>Registrar Entrada ou Baixa de Estoque</h2>
                </div>
              </div>

              <form className="panel-body" onSubmit={handleStockMovement}>
                {!isAdmin && (
                  <div className="rbac-notice">
                    <Lock size={16} />
                    <span>
                      Autorização RBAC: movimentações de estoque exigem perfil <strong>ADMIN</strong>.
                    </span>
                  </div>
                )}
                <div className="form-group">
                  <label>Selecionar Produto</label>
                  <select
                    className="form-control"
                    value={stockForm.productId}
                    onChange={(e) => setStockForm({ ...stockForm, productId: e.target.value })}
                  >
                    {appState.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.emoji} {p.name} (Atual: {p.stock} un.)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label>Tipo de Movimentação</label>
                    <select
                      className="form-control"
                      value={stockForm.type}
                      onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}
                    >
                      <option value="ENTRADA">ENTRADA (Reposição / Fornada)</option>
                      <option value="SAIDA">SAÍDA (Perda / Avaria / Consumo Interno)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Quantidade (Unidades)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="form-control"
                      value={stockForm.quantity}
                      onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Observação / Nota Fiscal / Lote</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ex: Recebimento Fornecedor / Fornada das 14h"
                    value={stockForm.reason}
                    onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={loading}>
                  <Boxes size={18} />
                  Confirmar Movimentação de Estoque (T3)
                </button>
              </form>
            </div>

            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <h2>Histórico de Movimentações de Estoque</h2>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Data / Hora</th>
                      <th>Produto</th>
                      <th>Tipo</th>
                      <th>Qtd</th>
                      <th>Motivo / Lote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appState.stockMovements.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontFamily: 'monospace' }}>{m.id}</td>
                        <td>{new Date(m.createdAt).toLocaleTimeString('pt-BR')}</td>
                        <td>
                          <strong>{m.productName}</strong>
                        </td>
                        <td>
                          <span
                            className={`badge-status ${
                              m.type === 'ENTRADA' ? 'entregue' : 'cancelado'
                            }`}
                          >
                            {m.type === 'ENTRADA' ? '▲ ENTRADA' : '▼ BAIXA'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800 }}>
                          {m.type === 'ENTRADA' ? `+${m.quantity}` : `-${m.quantity}`} un.
                        </td>
                        <td>{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 4: CARTEIRA UNIFOR (CADASTRO DE ALUNO & RECARGA DE SALDO)
            =================================================================== */}
        {activeTab === 'tx4' && (
          <div className="two-col-section">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Card 4A: Recarga Rápida */}
              <div className="panel-card">
                <div className="panel-header">
                  <div className="panel-header-title">
                    <span className="tx-tag">TRANSAÇÃO 4A</span>
                    <h2>Recarregar Créditos Carteira Unifor</h2>
                  </div>
                </div>
                <form className="panel-body" onSubmit={handleTopupWallet}>
                  <div className="form-group">
                    <label>Aluno / Professor</label>
                    <select
                      className="form-control"
                      value={walletTopupForm.customerId}
                      onChange={(e) =>
                        setWalletTopupForm({ ...walletTopupForm, customerId: e.target.value })
                      }
                    >
                      {appState.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.matricula}) — Saldo: R$ {c.balance.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label>Valor da Recarga (R$)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        required
                        className="form-control"
                        value={walletTopupForm.amount}
                        onChange={(e) =>
                          setWalletTopupForm({ ...walletTopupForm, amount: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Meio Recebido</label>
                      <select
                        className="form-control"
                        value={walletTopupForm.paymentMethod}
                        onChange={(e) =>
                          setWalletTopupForm({
                            ...walletTopupForm,
                            paymentMethod: e.target.value
                          })
                        }
                      >
                        <option value="PIX">PIX</option>
                        <option value="Cartão Débito/Crédito">Cartão</option>
                        <option value="Dinheiro">Dinheiro</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    <Wallet size={18} />
                    Creditar Recarga na Carteira (T4)
                  </button>
                </form>
              </div>

              {/* Card 4B: Novo Cadastro */}
              <div className="panel-card">
                <div className="panel-header">
                  <div className="panel-header-title">
                    <span className="tx-tag">TRANSAÇÃO 4B</span>
                    <h2>Cadastrar Novo Aluno / Professor</h2>
                  </div>
                </div>
                <form className="panel-body" onSubmit={handleCreateCustomer}>
                  <div className="form-group">
                    <label>Nome Completo</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      placeholder="Ex: Beatriz Sampaio"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    />
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label>Matrícula Unifor</label>
                      <input
                        type="text"
                        required
                        className="form-control"
                        placeholder="Ex: 2410982"
                        value={customerForm.matricula}
                        onChange={(e) =>
                          setCustomerForm({ ...customerForm, matricula: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Vínculo</label>
                      <select
                        className="form-control"
                        value={customerForm.role}
                        onChange={(e) => setCustomerForm({ ...customerForm, role: e.target.value })}
                      >
                        <option value="Aluno">Aluno</option>
                        <option value="Professor">Professor</option>
                        <option value="Colaborador">Colaborador</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Curso / Centro (CCT, CCJ, CCS, CCG)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={customerForm.course}
                      onChange={(e) => setCustomerForm({ ...customerForm, course: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Recarga Inicial Opcional (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-control"
                      value={customerForm.initialDeposit}
                      onChange={(e) =>
                        setCustomerForm({ ...customerForm, initialDeposit: e.target.value })
                      }
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    <Plus size={18} />
                    Cadastrar Cliente na Carteira Unifor (T4)
                  </button>
                </form>
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <h2>Clientes Cadastrados na Carteira Unifor ({appState.customers.length})</h2>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Matrícula</th>
                      <th>Nome</th>
                      <th>Curso / Lotação</th>
                      <th>Saldo Carteira</th>
                      <th>Consumo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appState.customers.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.matricula}</td>
                        <td>
                          <strong>{c.name}</strong> <small>({c.role})</small>
                        </td>
                        <td>{c.course}</td>
                        <td style={{ fontWeight: 800, color: '#047857' }}>
                          R$ {c.balance.toFixed(2)}
                        </td>
                        <td>R$ {c.totalSpent.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 5: FILA DE PEDIDOS DA COZINHA E ESTORNO/CANCELAMENTO
            =================================================================== */}
        {activeTab === 'tx5' && (
          <div className="panel-card">
            <div className="panel-header">
              <div className="panel-header-title">
                <span className="tx-tag">TRANSAÇÃO 5</span>
                <h2>Gestão de Fila de Pedidos (Cozinha) e Cancelamento / Estorno de Venda</h2>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Avance o status do pedido ou realize o estorno (devolve itens ao estoque e saldo ao aluno)
              </span>
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pedido / Ficha</th>
                    <th>Horário</th>
                    <th>Cliente</th>
                    <th>Itens do Pedido</th>
                    <th>Pagamento / Total</th>
                    <th>Status Atual</th>
                    <th>Ações da Transação 5</th>
                  </tr>
                </thead>
                <tbody>
                  {appState.orders.map((order) => {
                    const badgeClass =
                      order.status === 'Em Preparo'
                        ? 'preparo'
                        : order.status === 'Pronto para Retirada'
                        ? 'pronto'
                        : order.status === 'Entregue'
                        ? 'entregue'
                        : 'cancelado';

                    return (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>{' '}
                          <span
                            style={{
                              background: '#0046ad',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}
                          >
                            {order.ficha}
                          </span>
                        </td>
                        <td>{new Date(order.createdAt).toLocaleTimeString('pt-BR')}</td>
                        <td>{order.customerName}</td>
                        <td>
                          {order.items.map((i, idx) => (
                            <div key={idx} style={{ fontSize: '0.79rem' }}>
                              {i.qty}x {i.name}
                            </div>
                          ))}
                        </td>
                        <td>
                          <strong>R$ {order.total.toFixed(2)}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                            {order.paymentMethod}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-status ${badgeClass}`}>{order.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {order.status === 'Em Preparo' && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  handleOrderStatusChange(order.id, 'Pronto para Retirada')
                                }
                              >
                                Marcar Pronto
                              </button>
                            )}
                            {order.status === 'Pronto para Retirada' && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ borderColor: '#10b981', color: '#047857' }}
                                onClick={() => handleOrderStatusChange(order.id, 'Entregue')}
                              >
                                Entregar ao Cliente
                              </button>
                            )}
                            {order.status !== 'Cancelado/Estornado' && (
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() =>
                                  handleOrderStatusChange(order.id, 'Cancelado/Estornado')
                                }
                              >
                                Estornar Venda
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setLastReceipt(order)}
                            >
                              <Receipt size={14} /> Cupom
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================================================================
            TRANSAÇÃO 6: MOVIMENTAÇÃO DE CAIXA (ABERTURA, SANGRIA, SUPRIMENTO, FECHAMENTO)
            =================================================================== */}
        {activeTab === 'tx6' && (
          <div className="two-col-section">
            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <span className="tx-tag">TRANSAÇÃO 6</span>
                  <h2>Operação de Caixa e Turno</h2>
                </div>
              </div>

              <form className="panel-body" onSubmit={handleCashOperation}>
                {!isAdmin && (
                  <div className="rbac-notice">
                    <Lock size={16} />
                    <span>
                      Autorização RBAC: operações de <strong>SANGRIA</strong> e <strong>FECHAMENTO</strong> exigem perfil <strong>ADMIN</strong>.
                    </span>
                  </div>
                )}
                <div className="form-group">
                  <label>Tipo de Operação de Caixa</label>
                  <select
                    className="form-control"
                    value={cashOpForm.operationType}
                    onChange={(e) =>
                      setCashOpForm({ ...cashOpForm, operationType: e.target.value })
                    }
                  >
                    <option value="SUPRIMENTO">SUPRIMENTO (Entrada de Troco / Reforço)</option>
                    <option value="SANGRIA">SANGRIA (Retirada para Cofre / Despesa)</option>
                    <option value="ABERTURA">ABERTURA DE CAIXA (Iniciar Novo Turno)</option>
                    <option value="FECHAMENTO">FECHAMENTO DE CAIXA (Encerrar Turno)</option>
                  </select>
                </div>

                {cashOpForm.operationType !== 'FECHAMENTO' && (
                  <div className="form-group">
                    <label>Valor da Operação (R$)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      required
                      className="form-control"
                      value={cashOpForm.amount}
                      onChange={(e) => setCashOpForm({ ...cashOpForm, amount: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Operador Responsável</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={cashOpForm.operator}
                    onChange={(e) => setCashOpForm({ ...cashOpForm, operator: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Justificativa / Observação no Livro de Caixa</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ex: Sangria para cofre central / Troco adicional"
                    value={cashOpForm.description}
                    onChange={(e) =>
                      setCashOpForm({ ...cashOpForm, description: e.target.value })
                    }
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={loading}>
                  <Landmark size={18} />
                  Registrar Operação de Caixa (T6)
                </button>
              </form>
            </div>

            <div className="panel-card">
              <div className="panel-header">
                <div className="panel-header-title">
                  <h2>Livro Razão de Movimentações do Caixa</h2>
                </div>
                <strong style={{ color: '#0046ad' }}>
                  Saldo Atual: R$ {metrics.cashBalance.toFixed(2)}
                </strong>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Horário</th>
                      <th>Tipo</th>
                      <th>Meio</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appState.cashMovements.map((mov) => {
                      const isNegative = Number(mov.amount) < 0;
                      return (
                        <tr key={mov.id}>
                          <td style={{ fontFamily: 'monospace' }}>{mov.id}</td>
                          <td>{new Date(mov.createdAt).toLocaleTimeString('pt-BR')}</td>
                          <td>
                            <span
                              className={`badge-status ${
                                isNegative
                                  ? 'cancelado'
                                  : mov.type === 'FECHAMENTO'
                                  ? 'preparo'
                                  : 'entregue'
                              }`}
                            >
                              {mov.type}
                            </span>
                          </td>
                          <td>{mov.paymentMethod}</td>
                          <td>{mov.description}</td>
                          <td
                            style={{
                              fontWeight: 800,
                              color: isNegative ? '#b91c1c' : '#047857'
                            }}
                          >
                            {Number(mov.amount) >= 0
                              ? `+ R$ ${Number(mov.amount).toFixed(2)}`
                              : `- R$ ${Math.abs(Number(mov.amount)).toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE FICHA / COMPROVANTE DE VENDA */}
      {lastReceipt && (
        <div className="modal-backdrop" onClick={() => setLastReceipt(null)}>
          <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-header">
              <h3>UNIVERSIDADE DE FORTALEZA</h3>
              <p style={{ fontSize: '0.76rem' }}>CANTINA CENTRAL • COMPROVANTE PDV</p>
              <div className="receipt-ficha">FICHA {lastReceipt.ficha}</div>
              <div style={{ fontSize: '0.75rem' }}>
                Pedido: {lastReceipt.id} • {new Date(lastReceipt.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              <div><strong>Cliente:</strong> {lastReceipt.customerName}</div>
              <div><strong>Pagamento:</strong> {lastReceipt.paymentMethod}</div>
              <div><strong>Status:</strong> {lastReceipt.status}</div>
            </div>

            <div
              style={{
                borderTop: '1px dashed #94a3b8',
                borderBottom: '1px dashed #94a3b8',
                padding: '0.6rem 0',
                marginBottom: '0.6rem',
                fontSize: '0.78rem'
              }}
            >
              {lastReceipt.items.map((item, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}
                >
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <strong>R$ {(item.price * item.qty).toFixed(2)}</strong>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>R$ {lastReceipt.subtotal.toFixed(2)}</span>
              </div>
              {lastReceipt.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Desconto:</span>
                  <span>- R$ {lastReceipt.discount.toFixed(2)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  fontSize: '1rem',
                  marginTop: '0.3rem'
                }}
              >
                <span>TOTAL PAGO:</span>
                <span>R$ {lastReceipt.total.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setLastReceipt(null)}
            >
              Fechar Comprovante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
