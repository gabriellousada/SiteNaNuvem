import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_CASH_MOVEMENTS
} from '../data/initialData';

const STORAGE_KEYS = {
  PRODUCTS: 'unifor_pdv_products_v1',
  CUSTOMERS: 'unifor_pdv_customers_v1',
  ORDERS: 'unifor_pdv_orders_v1',
  STOCK_MOVEMENTS: 'unifor_pdv_stock_movements_v1',
  CASH_MOVEMENTS: 'unifor_pdv_cash_movements_v1',
  CASH_STATUS: 'unifor_pdv_cash_status_v1',
  AWS_CONFIG: 'unifor_pdv_aws_config_v1',
  AWS_LOGS: 'unifor_pdv_aws_logs_v1'
};

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

export function getAwsConfig() {
  const envUrl = import.meta.env.VITE_AWS_API_URL || '';
  return loadFromStorage(STORAGE_KEYS.AWS_CONFIG, {
    mode: envUrl ? 'cloud' : 'simulator', // 'simulator' | 'cloud'
    apiGatewayUrl: envUrl || 'https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/prod',
    region: 'us-east-1',
    stackName: 'pdv-cantina-unifor-stack'
  });
}

export function saveAwsConfig(config) {
  saveToStorage(STORAGE_KEYS.AWS_CONFIG, config);
  return config;
}

export function getAwsLogs() {
  return loadFromStorage(STORAGE_KEYS.AWS_LOGS, [
    {
      id: 'LOG-INIT',
      timestamp: new Date().toISOString(),
      method: 'GET',
      route: '/bootstrap',
      lambda: 'BootstrapStateHandler',
      dynamoTable: 'UniforCantina* (4 tabelas)',
      transactionCode: 'SYSTEM_INIT',
      status: 200,
      latencyMs: 38,
      mode: 'AWS Local Simulator',
      summary: 'Tabelas DynamoDB sincronizadas com sucesso'
    }
  ]);
}

function appendAwsLog(entry) {
  const logs = getAwsLogs();
  const next = [
    {
      id: `REQ-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      ...entry
    },
    ...logs.slice(0, 39)
  ];
  saveToStorage(STORAGE_KEYS.AWS_LOGS, next);
  return next;
}

export function clearAwsLogs() {
  saveToStorage(STORAGE_KEYS.AWS_LOGS, []);
  return [];
}

export function resetAllDemoData() {
  saveToStorage(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  saveToStorage(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  saveToStorage(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
  saveToStorage(STORAGE_KEYS.STOCK_MOVEMENTS, INITIAL_STOCK_MOVEMENTS);
  saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, INITIAL_CASH_MOVEMENTS);
  saveToStorage(STORAGE_KEYS.CASH_STATUS, { isOpen: true, openedAt: new Date().toISOString(), operator: 'Operador Caixa 01' });
  appendAwsLog({
    method: 'POST',
    route: '/admin/reset-seed',
    lambda: 'SeedDatabaseHandler',
    dynamoTable: 'UniforCantina*',
    transactionCode: 'SEED_DATA',
    status: 200,
    latencyMs: 54,
    mode: 'AWS Local Simulator',
    summary: 'Dados originais de demonstração restaurados nas tabelas DynamoDB'
  });
  return getFullStateLocal();
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
    }),
    awsLogs: getAwsLogs()
  };
}

async function callCloudOrSimulate({
  method,
  route,
  lambda,
  dynamoTable,
  transactionCode,
  payload,
  localExecutor
}) {
  const config = getAwsConfig();
  const start = performance.now();

  if (config.mode === 'cloud' && config.apiGatewayUrl) {
    const cleanBase = config.apiGatewayUrl.replace(/\/+$/, '');
    const response = await fetch(`${cleanBase}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = await response.json();
    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      appendAwsLog({
        method,
        route,
        lambda,
        dynamoTable,
        transactionCode,
        status: response.status,
        latencyMs,
        mode: 'AWS Cloud API Gateway',
        summary: data.message || 'Erro na requisição AWS Lambda'
      });
      throw new Error(data.message || `Erro HTTP ${response.status} na API Gateway`);
    }

    appendAwsLog({
      method,
      route,
      lambda,
      dynamoTable,
      transactionCode,
      status: response.status,
      latencyMs,
      mode: 'AWS Cloud API Gateway',
      summary: data.summary || `${transactionCode} executado na nuvem AWS`
    });
    return data;
  }

  // Simulador AWS Serverless Local (Idêntico ao comportamento das Lambdas em aws-backend/src/handlers.mjs)
  await new Promise((r) => setTimeout(r, 90));
  const result = localExecutor();
  const latencyMs = Math.round(performance.now() - start);

  appendAwsLog({
    method,
    route,
    lambda,
    dynamoTable,
    transactionCode,
    status: method === 'POST' ? 201 : 200,
    latencyMs,
    mode: 'AWS Local Simulator',
    summary: result.summary
  });

  return result;
}

export async function fetchInitialState() {
  const config = getAwsConfig();
  if (config.mode === 'cloud' && config.apiGatewayUrl) {
    try {
      const res = await callCloudOrSimulate({
        method: 'GET',
        route: '/state',
        lambda: 'GetSystemStateHandler',
        dynamoTable: 'UniforCantina*',
        transactionCode: 'FETCH_STATE'
      });
      return { ...res, awsLogs: getAwsLogs() };
    } catch (err) {
      console.warn('Falha ao conectar ao endpoint Cloud AWS, mantendo estado local:', err);
    }
  }
  return getFullStateLocal();
}

// ============================================================================
// TRANSAÇÃO 1: REALIZAR VENDA NO PDV (CHECKOUT DE PEDIDO)
// ============================================================================
export async function executeTransaction1CheckoutSale(orderInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/checkout',
    lambda: 'CheckoutSaleLambda',
    dynamoTable: 'UniforCantinaOrders + Products + Customers + Cash',
    transactionCode: 'TX_01_CHECKOUT_VENDA',
    payload: orderInput,
    localExecutor: () => {
      const state = getFullStateLocal();
      if (!state.cashStatus.isOpen) {
        throw new Error('O caixa está fechado! Realize a Abertura de Caixa (Transação 6) antes de vender.');
      }

      const { items, customerId, paymentMethod, discount = 0, cashReceived = 0 } = orderInput;
      if (!items || items.length === 0) {
        throw new Error('Adicione ao menos 1 item ao carrinho para finalizar a venda.');
      }

      const subtotal = Number(
        items.reduce((acc, item) => acc + item.price * item.qty, 0).toFixed(2)
      );
      const validDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
      const total = Number((subtotal - validDiscount).toFixed(2));

      // Verificar estoque de cada item
      const updatedProducts = [...state.products];
      for (const item of items) {
        const idx = updatedProducts.findIndex((p) => p.id === item.productId);
        if (idx === -1) throw new Error(`Produto ${item.name} não encontrado.`);
        if (updatedProducts[idx].stock < item.qty) {
          throw new Error(
            `Estoque insuficiente para "${updatedProducts[idx].name}" (Disponível: ${updatedProducts[idx].stock}).`
          );
        }
        updatedProducts[idx] = {
          ...updatedProducts[idx],
          stock: updatedProducts[idx].stock - item.qty
        };
      }

      // Verificar cliente se pagamento for Carteira Unifor
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
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          qty: i.qty
        }))
      };

      const updatedOrders = [newOrder, ...state.orders];
      const newCashMov = {
        id: `CX-${String(state.cashMovements.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        type: 'VENDA',
        amount: total,
        paymentMethod,
        description: `Venda ${newOrder.id} (${newOrder.ficha}) - ${customerLabel}`,
        operator: state.cashStatus.operator || 'Operador Caixa 01'
      };
      const updatedCash = [newCashMov, ...state.cashMovements];

      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
      saveToStorage(STORAGE_KEYS.ORDERS, updatedOrders);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        order: newOrder,
        state: getFullStateLocal(),
        summary: `Venda ${newOrder.id} (${newOrder.ficha}) no valor de R$ ${total.toFixed(2)} gravada no DynamoDB`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 2: CADASTRAR OU ATUALIZAR PRODUTO DO CARDÁPIO
// ============================================================================
export async function executeTransaction2UpsertProduct(productInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/products',
    lambda: 'UpsertProductLambda',
    dynamoTable: 'UniforCantinaProducts',
    transactionCode: 'TX_02_CADASTRO_PRODUTO',
    payload: productInput,
    localExecutor: () => {
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
        summary: `Produto "${savedProduct.name}" (${savedProduct.sku}) ${actionLabel} em UniforCantinaProducts`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 3: REPOSIÇÃO OU BAIXA DE ESTOQUE (MOVIMENTAÇÃO DE INSUMOS)
// ============================================================================
export async function executeTransaction3StockMovement(movementInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/stock-movements',
    lambda: 'AdjustStockLambda',
    dynamoTable: 'UniforCantinaProducts + UniforCantinaStockMovements',
    transactionCode: 'TX_03_MOVIMENTACAO_ESTOQUE',
    payload: movementInput,
    localExecutor: () => {
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
        operator: state.cashStatus.operator || 'Operador Caixa 01'
      };

      const updatedMovements = [movement, ...state.stockMovements];
      saveToStorage(STORAGE_KEYS.PRODUCTS, updatedProducts);
      saveToStorage(STORAGE_KEYS.STOCK_MOVEMENTS, updatedMovements);

      return {
        movement,
        state: getFullStateLocal(),
        summary: `${type} de ${qty} un. em "${product.name}" (Novo estoque: ${newStock})`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 4: CADASTRO DE ALUNO/CLIENTE E RECARGA DE CRÉDITOS (CARTEIRA UNIFOR)
// ============================================================================
export async function executeTransaction4CustomerWallet(walletInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/customers-wallet',
    lambda: 'CustomerWalletLambda',
    dynamoTable: 'UniforCantinaCustomers + UniforCantinaCashMovements',
    transactionCode: 'TX_04_CARTEIRA_ALUNO',
    payload: walletInput,
    localExecutor: () => {
      const state = getFullStateLocal();
      const { actionType } = walletInput; // 'CREATE_CUSTOMER' | 'TOPUP_WALLET'
      const updatedCustomers = [...state.customers];
      const updatedCash = [...state.cashMovements];

      if (actionType === 'CREATE_CUSTOMER') {
        const { name, matricula, course, role, initialDeposit = 0, paymentMethod = 'PIX' } = walletInput;
        if (!name || !matricula) {
          throw new Error('Informe o Nome completo e a Matrícula Unifor.');
        }
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
            operator: state.cashStatus.operator || 'Operador Caixa 01'
          });
        }

        saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
        saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

        return {
          customer: newCustomer,
          state: getFullStateLocal(),
          summary: `Cliente ${newCustomer.name} (${newCustomer.matricula}) cadastrado com saldo R$ ${deposit.toFixed(2)}`
        };
      }

      // Recarga de carteira existente
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
        operator: state.cashStatus.operator || 'Operador Caixa 01'
      });

      saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        customer: updatedCustomers[idx],
        state: getFullStateLocal(),
        summary: `Recarga de R$ ${topup.toFixed(2)} creditada para ${target.name} (Saldo: R$ ${newBalance.toFixed(2)})`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 5: GESTÃO DE FILA DE PEDIDOS E ESTORNO/CANCELAMENTO DE VENDA
// ============================================================================
export async function executeTransaction5OrderStatusOrRefund(orderActionInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/orders-status',
    lambda: 'OrderFulfillmentLambda',
    dynamoTable: 'UniforCantinaOrders + Products + Customers + Cash',
    transactionCode: 'TX_05_FILA_OU_ESTORNO_PEDIDO',
    payload: orderActionInput,
    localExecutor: () => {
      const state = getFullStateLocal();
      const { orderId, newStatus, reason } = orderActionInput;
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
        // Devolver produtos ao estoque
        for (const item of order.items) {
          const pIdx = updatedProducts.findIndex((p) => p.id === item.productId);
          if (pIdx !== -1) {
            updatedProducts[pIdx] = {
              ...updatedProducts[pIdx],
              stock: updatedProducts[pIdx].stock + item.qty
            };
          }
        }

        // Estornar saldo se foi pago com Carteira Unifor
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
          operator: state.cashStatus.operator || 'Operador Caixa 01'
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
        summary: `Pedido ${order.id} (${order.ficha}) atualizado para "${newStatus}"`
      };
    }
  });
}

// ============================================================================
// TRANSAÇÃO 6: OPERAÇÃO DE CAIXA (ABERTURA, SANGRIA, SUPRIMENTO E FECHAMENTO)
// ============================================================================
export async function executeTransaction6CashRegisterOperation(cashInput) {
  return callCloudOrSimulate({
    method: 'POST',
    route: '/transactions/cash-register',
    lambda: 'CashRegisterOperationLambda',
    dynamoTable: 'UniforCantinaCashMovements',
    transactionCode: 'TX_06_OPERACAO_CAIXA',
    payload: cashInput,
    localExecutor: () => {
      const state = getFullStateLocal();
      const { operationType, amount = 0, description = '', operator = 'Operador Caixa 01' } = cashInput;
      // operationType: 'ABERTURA' | 'SUPRIMENTO' | 'SANGRIA' | 'FECHAMENTO'

      const updatedCash = [...state.cashMovements];
      let nextStatus = { ...state.cashStatus };
      const numericAmount = Math.abs(Number(amount) || 0);

      if (operationType === 'ABERTURA') {
        nextStatus = {
          isOpen: true,
          openedAt: new Date().toISOString(),
          operator
        };
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'ABERTURA',
          amount: numericAmount,
          paymentMethod: 'Dinheiro',
          description: description || 'Abertura de turno com fundo de troco',
          operator
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
          operator
        });
      } else if (operationType === 'SANGRIA') {
        if (numericAmount <= 0) throw new Error('Informe um valor válido para a sangria de caixa.');
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'SANGRIA',
          amount: -numericAmount,
          paymentMethod: 'Dinheiro',
          description: description || 'Sangria / Retirada para cofre central',
          operator
        });
      } else if (operationType === 'FECHAMENTO') {
        nextStatus = {
          ...nextStatus,
          isOpen: false,
          closedAt: new Date().toISOString()
        };
        updatedCash.unshift({
          id: `CX-${String(updatedCash.length + 1).padStart(3, '0')}`,
          createdAt: new Date().toISOString(),
          type: 'FECHAMENTO',
          amount: 0,
          paymentMethod: 'Consolidado',
          description: description || 'Fechamento de turno conferido pelo operador',
          operator
        });
      }

      saveToStorage(STORAGE_KEYS.CASH_STATUS, nextStatus);
      saveToStorage(STORAGE_KEYS.CASH_MOVEMENTS, updatedCash);

      return {
        cashStatus: nextStatus,
        state: getFullStateLocal(),
        summary: `Operação de caixa "${operationType}" registrada no DynamoDB`
      };
    }
  });
}
