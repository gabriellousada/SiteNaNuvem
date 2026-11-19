import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_CASH_MOVEMENTS
} from '../data/initialData';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const STORAGE_KEYS = {
  PRODUCTS: 'unifor_pdv_products_v2',
  CUSTOMERS: 'unifor_pdv_customers_v2',
  ORDERS: 'unifor_pdv_orders_v2',
  STOCK_MOVEMENTS: 'unifor_pdv_stock_movements_v2',
  CASH_MOVEMENTS: 'unifor_pdv_cash_movements_v2',
  CASH_STATUS: 'unifor_pdv_cash_status_v2',
  USERS: 'unifor_pdv_users_v2',
  SESSION: 'unifor_pdv_session_v2'
};

const DEFAULT_LOCAL_USERS = [
  { id: 'USR-001', name: 'Gerente Cantina Unifor', email: 'admin@unifor.br', password: 'admin123', role: 'ADMIN' },
  { id: 'USR-002', name: 'Operador Caixa 01', email: 'caixa@unifor.br', password: 'caixa123', role: 'OPERADOR' }
];

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Erro ao salvar no storage:', err);
  }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  saveToStorage(STORAGE_KEYS.SESSION, session);
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

export function getFullStateLocal() {
  return {
    products: loadFromStorage(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS),
    customers: loadFromStorage(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS),
    orders: loadFromStorage(STORAGE_KEYS.ORDERS, INITIAL_ORDERS),
    stockMovements: loadFromStorage(STORAGE_KEYS.STOCK_MOVEMENTS, INITIAL_STOCK_MOVEMENTS),
    cashMovements: loadFromStorage(STORAGE_KEYS.CASH_MOVEMENTS, INITIAL_CASH_MOVEMENTS),
    cashStatus: loadFromStorage(STORAGE_KEYS.CASH_STATUS, {
      isOpen: true,
      openedAt: new Date(Date.now() - 180 * 60000).toISOString(),
      operator: 'Operador Caixa 01'
    })
  };
}

/**
 * Realiza chamada ao Web Service REST Node.js + SQLite com JWT.
 * Caso o servidor Node.js não esteja acessível (ex: hospedagem estática sem backend remoto),
 * executa o fallback local respeitando integralmente Autenticação e Autorização (RBAC).
 */
async function requestApiOrFallback({ method = 'GET', path, body, localExecutor }) {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.token && !session.isLocalFallback) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  // Se a sessão atual foi autenticada no fallback local, mantém coerência local
  if (session?.isLocalFallback && localExecutor && !path.startsWith('/auth/')) {
    return localExecutor(session.user);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new TypeError('BACKEND_UNAVAILABLE');
    }

    const data = await response.json();
    if (!response.ok) {
      const apiErr = new Error(data.message || `Erro HTTP ${response.status}`);
      apiErr.status = response.status;
      apiErr.isApiError = true;
      throw apiErr;
    }

    return data;
  } catch (err) {
    if (err.isApiError) {
      throw err;
    }
    if (localExecutor) {
      return localExecutor(session?.user || null);
    }
    throw new Error('Não foi possível conectar ao servidor backend Node.js.');
  }
}

// ============================================================================
// CONTROLE DE ACESSO (AUTENTICAÇÃO E AUTORIZAÇÃO)
// ============================================================================
export async function loginUser({ email, password }) {
  const res = await requestApiOrFallback({
    method: 'POST',
    path: '/auth/login',
    body: { email, password },
    localExecutor: () => {
      const users = loadFromStorage(STORAGE_KEYS.USERS, DEFAULT_LOCAL_USERS);
      const found = users.find(
        (u) => u.email.toLowerCase() === String(email).trim().toLowerCase() && u.password === password
      );
      if (!found) {
        throw new Error('E-mail ou senha inválidos.');
      }
      const user = { id: found.id, name: found.name, email: found.email, role: found.role };
      return {
        token: `local-jwt-${found.id}`,
        user,
        isLocalFallback: true,
        message: `Bem-vindo(a), ${user.name}!`
      };
    }
  });

  saveSession({
    token: res.token,
    user: res.user,
    isLocalFallback: Boolean(res.isLocalFallback)
  });
  return res;
}

export async function registerUser({ name, email, password, role = 'OPERADOR' }) {
  const res = await requestApiOrFallback({
    method: 'POST',
    path: '/auth/register',
    body: { name, email, password, role },
    localExecutor: () => {
      if (!name || !email || !password || password.length < 6) {
        throw new Error('Preencha nome, e-mail e senha com no mínimo 6 caracteres.');
      }
      const users = loadFromStorage(STORAGE_KEYS.USERS, DEFAULT_LOCAL_USERS);
      const cleanEmail = String(email).trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        throw new Error('Já existe um usuário cadastrado com este e-mail.');
      }
      const newUser = {
        id: `USR-${String(users.length + 1).padStart(3, '0')}`,
        name: name.trim(),
        email: cleanEmail,
        password,
        role: role === 'ADMIN' ? 'ADMIN' : 'OPERADOR'
      };
      users.push(newUser);
      saveToStorage(STORAGE_KEYS.USERS, users);
      const safeUser = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
      return {
        token: `local-jwt-${newUser.id}`,
        user: safeUser,
        isLocalFallback: true,
        message: `Usuário ${safeUser.name} cadastrado com sucesso!`
      };
    }
  });

  saveSession({
    token: res.token,
    user: res.user,
    isLocalFallback: Boolean(res.isLocalFallback)
  });
  return res;
}

export async function fetchInitialState() {
  return requestApiOrFallback({
    method: 'GET',
    path: '/state',
    localExecutor: () => getFullStateLocal()
  });
}

export async function resetAllDemoData() {
  return requestApiOrFallback({
    method: 'POST',
    path: '/admin/reset',
    localExecutor: (user) => {
      if (user?.role !== 'ADMIN') {
        throw new Error('Acesso negado (403): apenas usuários com perfil [ADMIN] podem restaurar os dados.');
      }
      saveToStorage(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
      saveToStorage(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
      saveToStorage(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
      saveToStorage(STORAGE_KEYS.STOCK_MOVEMENTS, INITIAL_STOCK_MOVEMENTS);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, INITIAL_CASH_MOVEMENTS);
      saveToStorage(STORAGE_KEYS.CASH_STATUS, {
        isOpen: true,
        openedAt: new Date().toISOString(),
        operator: user.name
      });
      return {
        state: getFullStateLocal(),
        summary: 'Dados de demonstração restaurados com sucesso.'
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 1: REALIZAR VENDA NO PDV (CHECKOUT DE PEDIDO)
// ============================================================================
export async function executeTransaction1CheckoutSale(orderInput) {
  return requestApiOrFallback({
    method: 'POST',
    path: '/transactions/checkout',
    body: orderInput,
    localExecutor: (user) => {
      const state = getFullStateLocal();
      if (!state.cashStatus.isOpen) {
        throw new Error('O caixa está fechado! Realize a Abertura de Caixa (Transação 6) antes de vender.');
      }
      const { items, customerId, paymentMethod, discount = 0, cashReceived = 0 } = orderInput;
      if (!items || items.length === 0) {
        throw new Error('Adicione ao menos 1 item ao carrinho para finalizar a venda.');
      }

      const subtotal = Number(items.reduce((acc, item) => acc + item.price * item.qty, 0).toFixed(2));
      const validDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
      const total = Number((subtotal - validDiscount).toFixed(2));

      const updatedProducts = [...state.products];
      for (const item of items) {
        const idx = updatedProducts.findIndex((p) => p.id === item.productId);
        if (idx === -1) throw new Error(`Produto ${item.name} não encontrado.`);
        if (updatedProducts[idx].stock < item.qty) {
          throw new Error(
            `Estoque insuficiente para "${updatedProducts[idx].name}" (Disponível: ${updatedProducts[idx].stock}).`
          );
        }
        updatedProducts[idx] = { ...updatedProducts[idx], stock: updatedProducts[idx].stock - item.qty };
      }

      const updatedCustomers = [...state.customers];
      let customerLabel = 'Cliente Balcão';
      if (customerId) {
        const cIdx = updatedCustomers.findIndex((c) => c.id === customerId);
        if (cIdx !== -1) {
          const customer = updatedCustomers[cIdx];
          customerLabel = `${customer.name} (${customer.matricula})`;
          if (paymentMethod === 'Carteira Unifor') {
            if (customer.balance < total) {
              throw new Error(
                `Saldo insuficiente na Carteira Unifor de ${customer.name}. Saldo atual: R$ ${customer.balance.toFixed(2)}`
              );
            }
            updatedCustomers[cIdx] = {
              ...customer,
              balance: Number((customer.balance - total).toFixed(2)),
              totalSpent: Number((customer.totalSpent + total).toFixed(2))
            };
          } else {
            updatedCustomers[cIdx] = {
              ...customer,
              totalSpent: Number((customer.totalSpent + total).toFixed(2))
            };
          }
        }
      } else if (paymentMethod === 'Carteira Unifor') {
        throw new Error('Selecione um Aluno/Professor cadastrado para pagar com Carteira Unifor.');
      }

      const nextNum = 1041 + state.orders.length;
      const fichaNum = String(41 + state.orders.length).padStart(3, '0');
      const newOrder = {
        id: `PED-${nextNum}`,
        ficha: `#${fichaNum}`,
        createdAt: new Date().toISOString(),
        customerName: customerLabel,
        customerId: customerId || null,
        paymentMethod,
        status: 'Em Preparo',
        subtotal,
        discount: validDiscount,
        total,
        cashReceived: paymentMethod === 'Dinheiro' ? Number(cashReceived) || total : total,
        change:
          paymentMethod === 'Dinheiro' && Number(cashReceived) > total
            ? Number((Number(cashReceived) - total).toFixed(2))
            : 0,
        items: items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty }))
      };

      const updatedOrders = [newOrder, ...state.orders];
      const updatedCash = [
        {
          id: `CX-${String(state.cashMovements.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'VENDA',
          amount: total,
          paymentMethod,
          description: `Venda ${newOrder.id} (${newOrder.ficha}) - ${customerLabel}`,
          operator: user?.name || 'Operador Caixa 01'
        },
        ...state.cashMovements
      ];

      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
      saveToStorage(STORAGE_KEYS.ORDERS, updatedOrders);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        order: newOrder,
        state: getFullStateLocal(),
        summary: `Venda ${newOrder.id} (${newOrder.ficha}) no valor de R$ ${total.toFixed(2)} registrada.`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 2: CADASTRAR OU ATUALIZAR PRODUTO DO CARDÁPIO (ADMIN)
// ============================================================================
export async function executeTransaction2UpsertProduct(productInput) {
  return requestApiOrFallback({
    method: 'POST',
    path: '/transactions/products',
    body: productInput,
    localExecutor: (user) => {
      if (user?.role !== 'ADMIN') {
        throw new Error('Acesso negado (403): apenas perfil [ADMIN] pode cadastrar ou editar produtos.');
      }
      const state = getFullStateLocal();
      const { id, sku, name, category, price, cost, stock, minStock, emoji } = productInput;
      if (!name || !sku || Number(price) <= 0) {
        throw new Error('Preencha nome, código SKU e preço de venda maior que zero.');
      }

      const updatedProducts = [...state.products];
      let savedProduct;
      let actionLabel = 'cadastrado';

      if (id) {
        const idx = updatedProducts.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error('Produto não encontrado para edição.');
        savedProduct = {
          ...updatedProducts[idx],
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          category,
          price: Number(price),
          cost: Number(cost) || 0,
          stock: Number(stock),
          minStock: Number(minStock) || 5,
          emoji: emoji || '🍔'
        };
        updatedProducts[idx] = savedProduct;
        actionLabel = 'atualizado';
      } else {
        savedProduct = {
          id: `PROD-${String(updatedProducts.length + 1).padStart(3, '0')}`,
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          category: category || 'Salgados',
          price: Number(price),
          cost: Number(cost) || 0,
          stock: Number(stock) || 0,
          minStock: Number(minStock) || 5,
          emoji: emoji || '🍔'
        };
        updatedProducts.unshift(savedProduct);
      }

      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      return {
        product: savedProduct,
        state: getFullStateLocal(),
        summary: `Produto "${savedProduct.name}" (${savedProduct.sku}) ${actionLabel}.`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 3: REPOSIÇÃO OU BAIXA DE ESTOQUE (ADMIN)
// ============================================================================
export async function executeTransaction3StockMovement(movementInput) {
  return requestApiOrFallback({
    method: 'POST',
    path: '/transactions/stock-movements',
    body: movementInput,
    localExecutor: (user) => {
      if (user?.role !== 'ADMIN') {
        throw new Error('Acesso negado (403): apenas perfil [ADMIN] pode movimentar o estoque.');
      }
      const state = getFullStateLocal();
      const { productId, type, quantity, reason } = movementInput;
      const qty = Number(quantity);
      if (!productId || !qty || qty <= 0) {
        throw new Error('Selecione um produto e informe uma quantidade válida maior que zero.');
      }

      const updatedProducts = [...state.products];
      const idx = updatedProducts.findIndex((p) => p.id === productId);
      if (idx === -1) throw new Error('Produto não encontrado.');

      const product = updatedProducts[idx];
      if (type === 'SAIDA' && product.stock < qty) {
        throw new Error(
          `Quantidade de baixa (${qty}) maior que o estoque atual de "${product.name}" (${product.stock}).`
        );
      }

      const newStock = type === 'ENTRADA' ? product.stock + qty : product.stock - qty;
      updatedProducts[idx] = { ...product, stock: newStock };

      const movement = {
        id: `MOV-EST-${String(state.stockMovements.length + 1).padStart(2, '0')}`,
        createdAt: new Date().toISOString(),
        productId: product.id,
        productName: product.name,
        type,
        quantity: qty,
        reason: reason?.trim() || (type === 'ENTRADA' ? 'Reposição de lote' : 'Baixa operacional'),
        operator: user?.name || 'Gerente'
      };

      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      saveToStorage(STORAGE_KEYS.STOCK_MOVEMENTS, [movement, ...state.stockMovements]);

      return {
        movement,
        state: getFullStateLocal(),
        summary: `${type} de ${qty} un. em "${product.name}" (Novo estoque: ${newStock}).`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 4: CADASTRO DE ALUNO E RECARGA DE CARTEIRA UNIFOR
// ============================================================================
export async function executeTransaction4CustomerWallet(walletInput) {
  return requestApiOrFallback({
    method: 'POST',
    path: '/transactions/customers-wallet',
    body: walletInput,
    localExecutor: (user) => {
      const state = getFullStateLocal();
      const { actionType } = walletInput;
      const updatedCustomers = [...state.customers];
      const updatedCash = [...state.cashMovements];

      if (actionType === 'CREATE_CUSTOMER') {
        const { name, matricula, course, role, initialDeposit = 0, paymentMethod = 'PIX' } = walletInput;
        if (!name || !matricula) throw new Error('Informe o Nome completo e a Matrícula Unifor.');
        if (updatedCustomers.some((c) => c.matricula === matricula.trim())) {
          throw new Error(`Já existe um cadastro com a matrícula ${matricula}.`);
        }

        const deposit = Math.max(0, Number(initialDeposit) || 0);
        const newCustomer = {
          id: `CLI-${String(updatedCustomers.length + 1).padStart(3, '0')}`,
          matricula: matricula.trim(),
          name: name.trim(),
          course: course?.trim() || 'Graduação Unifor',
          role: role || 'Aluno',
          balance: deposit,
          totalSpent: 0
        };
        updatedCustomers.unshift(newCustomer);

        if (deposit > 0) {
          updatedCash.unshift({
            id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
            createdAt: new Date().toISOString(),
            type: 'RECARGA_CARTEIRA',
            amount: deposit,
            paymentMethod,
            description: `Recarga inicial Carteira Unifor - ${newCustomer.name} (${newCustomer.matricula})`,
            operator: user?.name || 'Operador Caixa 01'
          });
        }

        saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
        saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

        return {
          customer: newCustomer,
          state: getFullStateLocal(),
          summary: `Cliente ${newCustomer.name} (${newCustomer.matricula}) cadastrado com saldo R$ ${deposit.toFixed(2)}.`
        };
      }

      const { customerId, amount, paymentMethod = 'PIX' } = walletInput;
      const topup = Number(amount);
      if (!customerId || !topup || topup <= 0) {
        throw new Error('Selecione um cliente e informe um valor de recarga maior que zero.');
      }

      const idx = updatedCustomers.findIndex((c) => c.id === customerId);
      if (idx === -1) throw new Error('Cliente não encontrado.');

      const target = updatedCustomers[idx];
      const newBalance = Number((target.balance + topup).toFixed(2));
      updatedCustomers[idx] = { ...target, balance: newBalance };

      updatedCash.unshift({
        id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        type: 'RECARGA_CARTEIRA',
        amount: topup,
        paymentMethod,
        description: `Recarga Carteira Unifor - ${target.name} (${target.matricula})`,
        operator: user?.name || 'Operador Caixa 01'
      });

      saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        customer: updatedCustomers[idx],
        state: getFullStateLocal(),
        summary: `Recarga de R$ ${topup.toFixed(2)} creditada para ${target.name} (Saldo: R$ ${newBalance.toFixed(2)}).`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 5: FILA DE PEDIDOS E ESTORNO/CANCELAMENTO (ESTORNO EXIGE ADMIN)
// ============================================================================
export async function executeTransaction5OrderStatusOrRefund({ orderId, newStatus, reason }) {
  return requestApiOrFallback({
    method: 'PATCH',
    path: `/transactions/orders/${encodeURIComponent(orderId)}/status`,
    body: { newStatus, reason },
    localExecutor: (user) => {
      if (newStatus === 'Cancelado/Estornado' && user?.role !== 'ADMIN') {
        throw new Error('Acesso negado (403): apenas perfil [ADMIN] pode cancelar ou estornar vendas.');
      }
      const state = getFullStateLocal();
      const updatedOrders = [...state.orders];
      const idx = updatedOrders.findIndex((o) => o.id === orderId);
      if (idx === -1) throw new Error('Pedido não encontrado.');

      const order = updatedOrders[idx];
      if (order.status === 'Cancelado/Estornado') {
        throw new Error('Este pedido já foi cancelado e estornado anteriormente.');
      }

      const updatedProducts = [...state.products];
      const updatedCustomers = [...state.customers];
      const updatedCash = [...state.cashMovements];

      if (newStatus === 'Cancelado/Estornado') {
        for (const item of order.items) {
          const pIdx = updatedProducts.findIndex((p) => p.id === item.productId);
          if (pIdx !== -1) {
            updatedProducts[pIdx] = { ...updatedProducts[pIdx], stock: updatedProducts[pIdx].stock + item.qty };
          }
        }
        if (order.customerId) {
          const cIdx = updatedCustomers.findIndex((c) => c.id === order.customerId);
          if (cIdx !== -1) {
            const cust = updatedCustomers[cIdx];
            updatedCustomers[cIdx] = {
              ...cust,
              balance:
                order.paymentMethod === 'Carteira Unifor'
                  ? Number((cust.balance + order.total).toFixed(2))
                  : cust.balance,
              totalSpent: Math.max(0, Number((cust.totalSpent - order.total).toFixed(2)))
            };
          }
        }
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'ESTORNO',
          amount: -order.total,
          paymentMethod: order.paymentMethod,
          description: `Estorno ${order.id} (${order.ficha}) - Motivo: ${reason || 'Cancelamento solicitado'}`,
          operator: user?.name || 'Gerente'
        });
      }

      updatedOrders[idx] = {
        ...order,
        status: newStatus,
        cancelReason: newStatus === 'Cancelado/Estornado' ? reason || 'Cancelado no PDV' : undefined
      };

      saveToStorage(STORAGE_KEYS.ORDERS, updatedOrders);
      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        order: updatedOrders[idx],
        state: getFullStateLocal(),
        summary: `Pedido ${order.id} (${order.ficha}) atualizado para "${newStatus}".`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 6: OPERAÇÃO DE CAIXA (SANGRIA E FECHAMENTO EXIGEM ADMIN)
// ============================================================================
export async function executeTransaction6CashRegisterOperation(cashInput) {
  return requestApiOrFallback({
    method: 'POST',
    path: '/transactions/cash-register',
    body: cashInput,
    localExecutor: (user) => {
      const { operationType, amount = 0, description = '', operator } = cashInput;
      if (['SANGRIA', 'FECHAMENTO'].includes(operationType) && user?.role !== 'ADMIN') {
        throw new Error(`Acesso negado (403): a operação [${operationType}] exige perfil [ADMIN].`);
      }

      const state = getFullStateLocal();
      const updatedCash = [...state.cashMovements];
      let nextStatus = { ...state.cashStatus };
      const numericAmount = Math.abs(Number(amount) || 0);
      const opName = operator || user?.name || 'Operador Caixa 01';

      if (operationType === 'ABERTURA') {
        nextStatus = { isOpen: true, openedAt: new Date().toISOString(), operator: opName };
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'ABERTURA',
          amount: numericAmount,
          paymentMethod: 'Dinheiro',
          description: description || 'Abertura de turno com fundo de troco',
          operator: opName
        });
      } else if (operationType === 'SUPRIMENTO') {
        if (numericAmount <= 0) throw new Error('Informe um valor válido para o suprimento de caixa.');
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'SUPRIMENTO',
          amount: numericAmount,
          paymentMethod: 'Dinheiro',
          description: description || 'Reforço de troco em espécie',
          operator: opName
        });
      } else if (operationType === 'SANGRIA') {
        if (numericAmount <= 0) throw new Error('Informe um valor válido para a sangria de caixa.');
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'SANGRIA',
          amount: -numericAmount,
          paymentMethod: 'Dinheiro',
          description: description || 'Sangria para cofre central',
          operator: opName
        });
      } else if (operationType === 'FECHAMENTO') {
        nextStatus = { ...nextStatus, isOpen: false, closedAt: new Date().toISOString() };
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'FECHAMENTO',
          amount: 0,
          paymentMethod: 'Consolidado',
          description: description || 'Fechamento de turno conferido pelo operador',
          operator: opName
        });
      }

      saveToStorage(STORAGE_KEYS.CASH_STATUS, nextStatus);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        cashStatus: nextStatus,
        state: getFullStateLocal(),
        summary: `Operação de caixa "${operationType}" registrada com sucesso.`
      };
    }
  });
}
