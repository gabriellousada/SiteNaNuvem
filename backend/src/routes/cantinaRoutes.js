import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

export function createCantinaRouter(db) {
  const router = Router();

  // Todas as rotas de negócio exigem autenticação JWT
  router.use(authenticateToken);

  // GET /api/state — Estado consolidado do PDV
  router.get('/state', (req, res) => {
    return res.status(200).json(db.getFullState());
  });

  // Consultas REST individuais por recurso
  router.get('/products', (req, res) => {
    const { products } = db.getFullState();
    return res.status(200).json({ products });
  });

  router.get('/customers', (req, res) => {
    const { customers } = db.getFullState();
    return res.status(200).json({ customers });
  });

  router.get('/orders', (req, res) => {
    const { orders } = db.getFullState();
    return res.status(200).json({ orders });
  });

  router.get('/stock-movements', (req, res) => {
    const { stockMovements } = db.getFullState();
    return res.status(200).json({ stockMovements });
  });

  router.get('/cash-movements', (req, res) => {
    const { cashMovements, cashStatus } = db.getFullState();
    return res.status(200).json({ cashMovements, cashStatus });
  });

  // POST /api/admin/reset — Restaurar dados demo (Somente ADMIN)
  router.post('/admin/reset', authorizeRoles('ADMIN'), (req, res) => {
    db.seedInitialData(true);
    return res.status(200).json({
      state: db.getFullState(),
      summary: 'Dados de demonstração restaurados no banco SQLite.'
    });
  });

  // ==========================================================================
  // TRANSAÇÃO 1 (T1): REALIZAR VENDA NO PDV (CHECKOUT DE PEDIDO)
  // Autorização: ADMIN e OPERADOR
  // ==========================================================================
  router.post('/transactions/checkout', authorizeRoles('ADMIN', 'OPERADOR'), (req, res) => {
    try {
      const { items, customerId = null, paymentMethod, discount = 0, cashReceived = 0 } = req.body || {};

      const cashStatus = db.get('SELECT is_open as isOpen, operator FROM cash_register_status WHERE id = 1');
      if (!cashStatus || !cashStatus.isOpen) {
        return res.status(400).json({
          error: 'CASH_CLOSED',
          message: 'O caixa está fechado! Realize a Abertura de Caixa (Transação 6) antes de vender.'
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: 'EMPTY_CART',
          message: 'Adicione ao menos 1 item ao carrinho para finalizar a venda.'
        });
      }

      if (!paymentMethod) {
        return res.status(400).json({
          error: 'INVALID_PAYMENT',
          message: 'Informe a forma de pagamento.'
        });
      }

      const result = db.transaction(() => {
        const resolvedItems = [];
        for (const item of items) {
          const qty = Number(item.qty);
          if (!item.productId || !qty || qty <= 0) {
            throw Object.assign(new Error('Item inválido no carrinho.'), { statusCode: 400 });
          }
          const product = db.get('SELECT * FROM products WHERE id = ?', [item.productId]);
          if (!product) {
            throw Object.assign(new Error(`Produto ${item.productId} não encontrado.`), { statusCode: 404 });
          }
          if (product.stock < qty) {
            throw Object.assign(
              new Error(`Estoque insuficiente para "${product.name}" (Disponível: ${product.stock}).`),
              { statusCode: 400 }
            );
          }
          resolvedItems.push({
            productId: product.id,
            name: product.name,
            price: Number(product.price),
            qty
          });
        }

        const subtotal = Number(
          resolvedItems.reduce((acc, item) => acc + item.price * item.qty, 0).toFixed(2)
        );
        const validDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
        const total = Number((subtotal - validDiscount).toFixed(2));

        let customerLabel = 'Cliente Balcão';
        if (customerId) {
          const customer = db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
          if (!customer) {
            throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 });
          }
          customerLabel = `${customer.name} (${customer.matricula})`;

          if (paymentMethod === 'Carteira Unifor') {
            if (Number(customer.balance) < total) {
              throw Object.assign(
                new Error(
                  `Saldo insuficiente na Carteira Unifor de ${customer.name}. Saldo atual: R$ ${Number(customer.balance).toFixed(2)}`
                ),
                { statusCode: 400 }
              );
            }
            db.run(
              'UPDATE customers SET balance = ROUND(balance - ?, 2), total_spent = ROUND(total_spent + ?, 2) WHERE id = ?',
              [total, total, customer.id]
            );
          } else {
            db.run('UPDATE customers SET total_spent = ROUND(total_spent + ?, 2) WHERE id = ?', [
              total,
              customer.id
            ]);
          }
        } else if (paymentMethod === 'Carteira Unifor') {
          throw Object.assign(
            new Error('Selecione um Aluno/Professor cadastrado para pagar com Carteira Unifor.'),
            { statusCode: 400 }
          );
        }

        // Baixa atômica de estoque
        const now = new Date().toISOString();
        for (const item of resolvedItems) {
          db.run('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?', [
            item.qty,
            now,
            item.productId
          ]);
        }

        const ordersCount = db.get('SELECT COUNT(*) as count FROM orders')?.count || 0;
        const nextNum = 1041 + ordersCount;
        const fichaNum = String(41 + ordersCount).padStart(3, '0');
        const orderId = `PED-${nextNum}`;
        const ficha = `#${fichaNum}`;
        const paidCash = paymentMethod === 'Dinheiro' ? Number(cashReceived) || total : total;
        const changeAmount =
          paymentMethod === 'Dinheiro' && paidCash > total
            ? Number((paidCash - total).toFixed(2))
            : 0;

        db.run(
          `INSERT INTO orders (id, ficha, customer_id, customer_name, payment_method, status, subtotal, discount, total, cash_received, change_amount, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            ficha,
            customerId || null,
            customerLabel,
            paymentMethod,
            'Em Preparo',
            subtotal,
            validDiscount,
            total,
            paidCash,
            changeAmount,
            req.user.name,
            now
          ]
        );

        for (const item of resolvedItems) {
          db.run(
            'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.productId, item.name, item.price, item.qty]
          );
        }

        const cashCount = db.get('SELECT COUNT(*) as count FROM cash_movements')?.count || 0;
        const cashId = `CX-${String(cashCount + 1).padStart(3, '0')}`;
        db.run(
          `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            cashId,
            'VENDA',
            total,
            paymentMethod,
            `Venda ${orderId} (${ficha}) - ${customerLabel}`,
            req.user.name,
            now
          ]
        );

        return {
          order: {
            id: orderId,
            ficha,
            createdAt: now,
            customerId: customerId || null,
            customerName: customerLabel,
            paymentMethod,
            status: 'Em Preparo',
            subtotal,
            discount: validDiscount,
            total,
            cashReceived: paidCash,
            change: changeAmount,
            items: resolvedItems
          }
        };
      });

      return res.status(201).json({
        order: result.order,
        state: db.getFullState(),
        summary: `Venda ${result.order.id} (${result.order.ficha}) no valor de R$ ${result.order.total.toFixed(2)} registrada no SQLite.`
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ==========================================================================
  // TRANSAÇÃO 2 (T2): CADASTRAR OU EDITAR PRODUTO NO CARDÁPIO
  // Autorização: Somente ADMIN
  // ==========================================================================
  router.post('/transactions/products', authorizeRoles('ADMIN'), (req, res) => {
    try {
      const { id, sku, name, category = 'Salgados', price, cost = 0, stock = 0, minStock = 5, emoji = '🍔' } =
        req.body || {};

      if (!name || !sku || Number(price) <= 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Preencha nome, código SKU e preço de venda maior que zero.'
        });
      }

      const cleanSku = String(sku).trim().toUpperCase();
      const cleanName = String(name).trim();
      const now = new Date().toISOString();

      let savedProduct;
      let actionLabel = 'cadastrado';

      db.transaction(() => {
        if (id) {
          const existing = db.get('SELECT * FROM products WHERE id = ?', [id]);
          if (!existing) {
            throw Object.assign(new Error('Produto não encontrado para edição.'), { statusCode: 404 });
          }
          const skuConflict = db.get('SELECT id FROM products WHERE sku = ? AND id != ?', [cleanSku, id]);
          if (skuConflict) {
            throw Object.assign(new Error(`O código SKU ${cleanSku} já está em uso por outro produto.`), {
              statusCode: 409
            });
          }
          db.run(
            `UPDATE products
             SET sku = ?, name = ?, category = ?, price = ?, cost = ?, stock = ?, min_stock = ?, emoji = ?, updated_at = ?
             WHERE id = ?`,
            [
              cleanSku,
              cleanName,
              category,
              Number(price),
              Number(cost) || 0,
              Number(stock) || 0,
              Number(minStock) || 5,
              emoji || '🍔',
              now,
              id
            ]
          );
          savedProduct = db.get(
            'SELECT id, sku, name, category, price, cost, stock, min_stock as minStock, emoji FROM products WHERE id = ?',
            [id]
          );
          actionLabel = 'atualizado';
        } else {
          const skuConflict = db.get('SELECT id FROM products WHERE sku = ?', [cleanSku]);
          if (skuConflict) {
            throw Object.assign(new Error(`Já existe um produto cadastrado com o SKU ${cleanSku}.`), {
              statusCode: 409
            });
          }
          const count = db.get('SELECT COUNT(*) as count FROM products')?.count || 0;
          const newId = `PROD-${String(count + 1).padStart(3, '0')}`;
          db.run(
            `INSERT INTO products (id, sku, name, category, price, cost, stock, min_stock, emoji, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId,
              cleanSku,
              cleanName,
              category,
              Number(price),
              Number(cost) || 0,
              Number(stock) || 0,
              Number(minStock) || 5,
              emoji || '🍔',
              now
            ]
          );
          savedProduct = db.get(
            'SELECT id, sku, name, category, price, cost, stock, min_stock as minStock, emoji FROM products WHERE id = ?',
            [newId]
          );
        }
      });

      return res.status(id ? 200 : 201).json({
        product: savedProduct,
        state: db.getFullState(),
        summary: `Produto "${savedProduct.name}" (${savedProduct.sku}) ${actionLabel} no banco SQLite.`
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ==========================================================================
  // TRANSAÇÃO 3 (T3): REPOSIÇÃO E BAIXA DE ESTOQUE (MOVIMENTAÇÃO DE INSUMOS)
  // Autorização: Somente ADMIN
  // ==========================================================================
  router.post('/transactions/stock-movements', authorizeRoles('ADMIN'), (req, res) => {
    try {
      const { productId, type, quantity, reason } = req.body || {};
      const qty = Number(quantity);

      if (!productId || !['ENTRADA', 'SAIDA'].includes(type) || !qty || qty <= 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Selecione um produto, tipo válido (ENTRADA/SAIDA) e quantidade maior que zero.'
        });
      }

      const result = db.transaction(() => {
        const product = db.get('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
          throw Object.assign(new Error('Produto não encontrado.'), { statusCode: 404 });
        }
        if (type === 'SAIDA' && product.stock < qty) {
          throw Object.assign(
            new Error(`Quantidade de baixa (${qty}) maior que o estoque atual de "${product.name}" (${product.stock}).`),
            { statusCode: 400 }
          );
        }

        const newStock = type === 'ENTRADA' ? product.stock + qty : product.stock - qty;
        const now = new Date().toISOString();

        db.run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', [newStock, now, product.id]);

        const count = db.get('SELECT COUNT(*) as count FROM stock_movements')?.count || 0;
        const movId = `MOV-EST-${String(count + 1).padStart(2, '0')}`;
        const cleanReason =
          String(reason || '').trim() || (type === 'ENTRADA' ? 'Reposição de lote' : 'Baixa operacional');

        db.run(
          `INSERT INTO stock_movements (id, product_id, product_name, type, quantity, reason, operator, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [movId, product.id, product.name, type, qty, cleanReason, req.user.name, now]
        );

        return {
          newStock,
          productName: product.name,
          movement: {
            id: movId,
            productId: product.id,
            productName: product.name,
            type,
            quantity: qty,
            reason: cleanReason,
            operator: req.user.name,
            createdAt: now
          }
        };
      });

      return res.status(201).json({
        movement: result.movement,
        state: db.getFullState(),
        summary: `${type} de ${qty} un. em "${result.productName}" (Novo estoque: ${result.newStock}).`
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ==========================================================================
  // TRANSAÇÃO 4 (T4): CARTEIRA UNIFOR (CADASTRO DE ALUNO & RECARGA DE SALDO)
  // Autorização: ADMIN e OPERADOR
  // ==========================================================================
  router.post('/transactions/customers-wallet', authorizeRoles('ADMIN', 'OPERADOR'), (req, res) => {
    try {
      const body = req.body || {};
      const { actionType } = body;

      if (actionType === 'CREATE_CUSTOMER') {
        const { name, matricula, course = 'Graduação Unifor', role = 'Aluno', initialDeposit = 0, paymentMethod = 'PIX' } =
          body;
        if (!name || !matricula) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Informe o Nome completo e a Matrícula Unifor.'
          });
        }

        const cleanMatricula = String(matricula).trim();
        const deposit = Math.max(0, Number(initialDeposit) || 0);
        const now = new Date().toISOString();

        const newCustomer = db.transaction(() => {
          const existing = db.get('SELECT id FROM customers WHERE matricula = ?', [cleanMatricula]);
          if (existing) {
            throw Object.assign(new Error(`Já existe um cadastro com a matrícula ${cleanMatricula}.`), {
              statusCode: 409
            });
          }

          const count = db.get('SELECT COUNT(*) as count FROM customers')?.count || 0;
          const newId = `CLI-${String(count + 1).padStart(3, '0')}`;
          db.run(
            `INSERT INTO customers (id, matricula, name, course, role, balance, total_spent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [newId, cleanMatricula, String(name).trim(), String(course).trim(), role, deposit, 0, now]
          );

          if (deposit > 0) {
            const cashCount = db.get('SELECT COUNT(*) as count FROM cash_movements')?.count || 0;
            const cashId = `CX-${String(cashCount + 1).padStart(3, '0')}`;
            db.run(
              `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                cashId,
                'RECARGA_CARTEIRA',
                deposit,
                paymentMethod,
                `Recarga inicial Carteira Unifor - ${String(name).trim()} (${cleanMatricula})`,
                req.user.name,
                now
              ]
            );
          }

          return db.get(
            'SELECT id, matricula, name, course, role, balance, total_spent as totalSpent FROM customers WHERE id = ?',
            [newId]
          );
        });

        return res.status(201).json({
          customer: newCustomer,
          state: db.getFullState(),
          summary: `Cliente ${newCustomer.name} (${newCustomer.matricula}) cadastrado com saldo R$ ${Number(newCustomer.balance).toFixed(2)}.`
        });
      }

      if (actionType === 'TOPUP_WALLET') {
        const { customerId, amount, paymentMethod = 'PIX' } = body;
        const topup = Number(amount);
        if (!customerId || !topup || topup <= 0) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Selecione um cliente e informe um valor de recarga maior que zero.'
          });
        }

        const updatedCustomer = db.transaction(() => {
          const target = db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
          if (!target) {
            throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 });
          }

          db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [topup, target.id]);

          const now = new Date().toISOString();
          const cashCount = db.get('SELECT COUNT(*) as count FROM cash_movements')?.count || 0;
          const cashId = `CX-${String(cashCount + 1).padStart(3, '0')}`;
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              cashId,
              'RECARGA_CARTEIRA',
              topup,
              paymentMethod,
              `Recarga Carteira Unifor - ${target.name} (${target.matricula})`,
              req.user.name,
              now
            ]
          );

          return db.get(
            'SELECT id, matricula, name, course, role, balance, total_spent as totalSpent FROM customers WHERE id = ?',
            [target.id]
          );
        });

        return res.status(201).json({
          customer: updatedCustomer,
          state: db.getFullState(),
          summary: `Recarga de R$ ${topup.toFixed(2)} creditada para ${updatedCustomer.name} (Saldo: R$ ${Number(updatedCustomer.balance).toFixed(2)}).`
        });
      }

      return res.status(400).json({ message: 'actionType deve ser CREATE_CUSTOMER ou TOPUP_WALLET.' });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ==========================================================================
  // TRANSAÇÃO 5 (T5): FILA DE PEDIDOS E CANCELAMENTO/ESTORNO DE VENDA
  // Autorização: OPERADOR avança fila; somente ADMIN pode Estornar/Cancelar
  // ==========================================================================
  router.patch('/transactions/orders/:orderId/status', authorizeRoles('ADMIN', 'OPERADOR'), (req, res) => {
    try {
      const { orderId } = req.params;
      const { newStatus, reason = '' } = req.body || {};

      const allowedStatuses = ['Em Preparo', 'Pronto para Retirada', 'Entregue', 'Cancelado/Estornado'];
      if (!allowedStatuses.includes(newStatus)) {
        return res.status(400).json({ message: 'Status de pedido inválido.' });
      }

      if (newStatus === 'Cancelado/Estornado' && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Apenas usuários com perfil [ADMIN] possuem autorização para cancelar/estornar vendas.'
        });
      }

      const updatedOrder = db.transaction(() => {
        const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) {
          throw Object.assign(new Error('Pedido não encontrado.'), { statusCode: 404 });
        }
        if (order.status === 'Cancelado/Estornado') {
          throw Object.assign(new Error('Este pedido já foi cancelado e estornado anteriormente.'), {
            statusCode: 400
          });
        }

        const now = new Date().toISOString();

        if (newStatus === 'Cancelado/Estornado') {
          const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
          for (const item of items) {
            db.run('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', [
              item.qty,
              now,
              item.product_id
            ]);
          }

          if (order.customer_id) {
            if (order.payment_method === 'Carteira Unifor') {
              db.run(
                'UPDATE customers SET balance = ROUND(balance + ?, 2), total_spent = MAX(0, ROUND(total_spent - ?, 2)) WHERE id = ?',
                [order.total, order.total, order.customer_id]
              );
            } else {
              db.run(
                'UPDATE customers SET total_spent = MAX(0, ROUND(total_spent - ?, 2)) WHERE id = ?',
                [order.total, order.customer_id]
              );
            }
          }

          const cashCount = db.get('SELECT COUNT(*) as count FROM cash_movements')?.count || 0;
          const cashId = `CX-${String(cashCount + 1).padStart(3, '0')}`;
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              cashId,
              'ESTORNO',
              -Number(order.total),
              order.payment_method,
              `Estorno ${order.id} (${order.ficha}) - Motivo: ${reason || 'Cancelamento solicitado'}`,
              req.user.name,
              now
            ]
          );
        }

        db.run('UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?', [
          newStatus,
          newStatus === 'Cancelado/Estornado' ? reason || 'Cancelado no PDV' : null,
          order.id
        ]);

        return { id: order.id, ficha: order.ficha, status: newStatus };
      });

      return res.status(200).json({
        order: updatedOrder,
        state: db.getFullState(),
        summary: `Pedido ${updatedOrder.id} (${updatedOrder.ficha}) atualizado para "${updatedOrder.status}".`
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  // ==========================================================================
  // TRANSAÇÃO 6 (T6): OPERAÇÃO DE CAIXA (ABERTURA, SUPRIMENTO, SANGRIA, FECHAMENTO)
  // Autorização: SANGRIA e FECHAMENTO exigem perfil ADMIN
  // ==========================================================================
  router.post('/transactions/cash-register', authorizeRoles('ADMIN', 'OPERADOR'), (req, res) => {
    try {
      const { operationType, amount = 0, description = '', operator } = req.body || {};
      const validOps = ['ABERTURA', 'SUPRIMENTO', 'SANGRIA', 'FECHAMENTO'];

      if (!validOps.includes(operationType)) {
        return res.status(400).json({ message: 'Tipo de operação de caixa inválido.' });
      }

      if (['SANGRIA', 'FECHAMENTO'].includes(operationType) && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: `A operação [${operationType}] exige autorização de perfil [ADMIN].`
        });
      }

      const numericAmount = Math.abs(Number(amount) || 0);
      if (['SUPRIMENTO', 'SANGRIA'].includes(operationType) && numericAmount <= 0) {
        return res.status(400).json({
          message: `Informe um valor maior que zero para ${operationType}.`
        });
      }

      const opUser = String(operator || req.user.name).trim();
      const now = new Date().toISOString();

      db.transaction(() => {
        const cashCount = db.get('SELECT COUNT(*) as count FROM cash_movements')?.count || 0;
        const cashId = `CX-${String(cashCount + 1).padStart(3, '0')}`;

        if (operationType === 'ABERTURA') {
          db.run(
            'UPDATE cash_register_status SET is_open = 1, opened_at = ?, closed_at = NULL, operator = ? WHERE id = 1',
            [now, opUser]
          );
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cashId, 'ABERTURA', numericAmount, 'Dinheiro', description || 'Abertura de turno com fundo de troco', opUser, now]
          );
        } else if (operationType === 'SUPRIMENTO') {
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cashId, 'SUPRIMENTO', numericAmount, 'Dinheiro', description || 'Reforço de troco em espécie', opUser, now]
          );
        } else if (operationType === 'SANGRIA') {
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cashId, 'SANGRIA', -numericAmount, 'Dinheiro', description || 'Sangria para cofre central', opUser, now]
          );
        } else if (operationType === 'FECHAMENTO') {
          db.run(
            'UPDATE cash_register_status SET is_open = 0, closed_at = ?, operator = ? WHERE id = 1',
            [now, opUser]
          );
          db.run(
            `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cashId, 'FECHAMENTO', 0, 'Consolidado', description || 'Fechamento de turno conferido', opUser, now]
          );
        }
      });

      const state = db.getFullState();
      return res.status(201).json({
        cashStatus: state.cashStatus,
        state,
        summary: `Operação de caixa "${operationType}" registrada com sucesso no SQLite.`
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  return router;
}
