import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';

describe('Suite de Testes Formais - Web Service REST PDV Cantina Unifor (Node.js + SQLite + JWT/RBAC)', () => {
  let db;
  let app;
  let adminToken;
  let operatorToken;

  before(async () => {
    db = await createDatabase({ memory: true });
    app = createApp(db);
  });

  after(() => {
    db.close();
  });

  describe('1. Disponibilidade do Serviço e Controle de Acesso (Autenticação & Autorização)', () => {
    it('GET /api/health deve responder 200 UP com banco SQLite carregado', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'UP');
      assert.equal(res.body.database, 'SQLite');
      assert.ok(res.body.productsLoaded >= 10);
    });

    it('Deve bloquear acesso a rotas protegidas sem token JWT (HTTP 401)', async () => {
      const res = await request(app).get('/api/state');
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
    });

    it('POST /api/auth/login deve rejeitar senha incorreta (HTTP 401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unifor.br', password: 'senha-errada' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'INVALID_CREDENTIALS');
    });

    it('POST /api/auth/login deve autenticar ADMIN e OPERADOR retornando JWT válido', async () => {
      const resAdmin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unifor.br', password: 'admin123' });
      assert.equal(resAdmin.status, 200);
      assert.ok(resAdmin.body.token);
      assert.equal(resAdmin.body.user.role, 'ADMIN');
      adminToken = resAdmin.body.token;

      const resOp = await request(app)
        .post('/api/auth/login')
        .send({ email: 'caixa@unifor.br', password: 'caixa123' });
      assert.equal(resOp.status, 200);
      assert.ok(resOp.body.token);
      assert.equal(resOp.body.user.role, 'OPERADOR');
      operatorToken = resOp.body.token;
    });

    it('POST /api/auth/register deve cadastrar novo usuário com hash bcrypt e impedir duplicidade', async () => {
      const resCreate = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Novo Atendente', email: 'atendente@unifor.br', password: 'segredo123' });
      assert.equal(resCreate.status, 201);
      assert.equal(resCreate.body.user.role, 'OPERADOR');

      const resDup = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Duplicado', email: 'atendente@unifor.br', password: 'segredo123' });
      assert.equal(resDup.status, 409);
    });

    it('RBAC: OPERADOR deve receber HTTP 403 em operações exclusivas de ADMIN', async () => {
      const resUsers = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${operatorToken}`);
      assert.equal(resUsers.status, 403);

      const resProd = await request(app)
        .post('/api/transactions/products')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ sku: 'TEST-99', name: 'Empada Teste', price: 10, stock: 5 });
      assert.equal(resProd.status, 403);

      const resStock = await request(app)
        .post('/api/transactions/stock-movements')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ productId: 'PROD-001', type: 'ENTRADA', quantity: 5, reason: 'Teste' });
      assert.equal(resStock.status, 403);

      const resSangria = await request(app)
        .post('/api/transactions/cash-register')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ operationType: 'SANGRIA', amount: 20, description: 'Tentativa não autorizada' });
      assert.equal(resSangria.status, 403);
    });
  });

  describe('2. Testes Formais das 6 Transações de Negócio no SQLite', () => {
    let createdOrderId;
    let createdProductId;
    let createdCustomerId;

    it('T1 - POST /api/transactions/checkout: deve efetuar venda com Carteira Unifor, baixar estoque e debitar saldo', async () => {
      const beforeState = await request(app)
        .get('/api/state')
        .set('Authorization', `Bearer ${operatorToken}`);
      const coxinhaBefore = beforeState.body.products.find((p) => p.id === 'PROD-001');
      const alunoBefore = beforeState.body.customers.find((c) => c.id === 'CLI-001');

      const res = await request(app)
        .post('/api/transactions/checkout')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          items: [{ productId: 'PROD-001', qty: 2 }],
          customerId: 'CLI-001',
          paymentMethod: 'Carteira Unifor',
          discount: 1.0
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.order.total, 16.0); // 2 * 8.50 - 1.00 = 16.00
      createdOrderId = res.body.order.id;

      const coxinhaAfter = res.body.state.products.find((p) => p.id === 'PROD-001');
      const alunoAfter = res.body.state.customers.find((c) => c.id === 'CLI-001');

      assert.equal(coxinhaAfter.stock, coxinhaBefore.stock - 2);
      assert.equal(alunoAfter.balance, Number((alunoBefore.balance - 16.0).toFixed(2)));
    });

    it('T1 (Validação) - deve recusar venda quando saldo da Carteira Unifor for insuficiente (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/transactions/checkout')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          items: [{ productId: 'PROD-009', qty: 2 }], // 32.00 > saldo de CLI-004 (8.00)
          customerId: 'CLI-004',
          paymentMethod: 'Carteira Unifor'
        });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /Saldo insuficiente/);
    });

    it('T2 - POST /api/transactions/products: ADMIN deve cadastrar e depois atualizar um produto', async () => {
      const resCreate = await request(app)
        .post('/api/transactions/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'EMP-01',
          name: 'Empada de Frango Cremoso',
          category: 'Salgados',
          price: 9.5,
          cost: 4.0,
          stock: 15,
          minStock: 5,
          emoji: '🥧'
        });

      assert.equal(resCreate.status, 201);
      assert.equal(resCreate.body.product.sku, 'EMP-01');
      createdProductId = resCreate.body.product.id;

      const resEdit = await request(app)
        .post('/api/transactions/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: createdProductId,
          sku: 'EMP-01',
          name: 'Empada de Frango Especial',
          category: 'Salgados',
          price: 10.0,
          cost: 4.2,
          stock: 15,
          minStock: 5,
          emoji: '🥧'
        });

      assert.equal(resEdit.status, 200);
      assert.equal(resEdit.body.product.price, 10.0);
    });

    it('T3 - POST /api/transactions/stock-movements: ADMIN deve registrar ENTRADA e SAIDA de estoque e validar excesso', async () => {
      const resIn = await request(app)
        .post('/api/transactions/stock-movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: createdProductId,
          type: 'ENTRADA',
          quantity: 10,
          reason: 'Fornada teste automatizado'
        });
      assert.equal(resIn.status, 201);
      const prodAfterIn = resIn.body.state.products.find((p) => p.id === createdProductId);
      assert.equal(prodAfterIn.stock, 25);

      const resInvalidOut = await request(app)
        .post('/api/transactions/stock-movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: createdProductId,
          type: 'SAIDA',
          quantity: 999,
          reason: 'Baixa maior que estoque'
        });
      assert.equal(resInvalidOut.status, 400);
    });

    it('T4 - POST /api/transactions/customers-wallet: deve cadastrar aluno e recarregar Carteira Unifor', async () => {
      const resNew = await request(app)
        .post('/api/transactions/customers-wallet')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          actionType: 'CREATE_CUSTOMER',
          name: 'Beatriz Sampaio',
          matricula: '2420999',
          course: 'ADS - Unifor',
          role: 'Aluno',
          initialDeposit: 30,
          paymentMethod: 'PIX'
        });

      assert.equal(resNew.status, 201);
      assert.equal(resNew.body.customer.balance, 30);
      createdCustomerId = resNew.body.customer.id;

      const resTopup = await request(app)
        .post('/api/transactions/customers-wallet')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          actionType: 'TOPUP_WALLET',
          customerId: createdCustomerId,
          amount: 25,
          paymentMethod: 'PIX'
        });

      assert.equal(resTopup.status, 201);
      assert.equal(resTopup.body.customer.balance, 55);
    });

    it('T5 - PATCH /api/transactions/orders/:id/status: OPERADOR avança fila, mas só ADMIN pode Estornar com devolução de estoque/saldo', async () => {
      const resReady = await request(app)
        .patch(`/api/transactions/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ newStatus: 'Pronto para Retirada' });
      assert.equal(resReady.status, 200);
      assert.equal(resReady.body.order.status, 'Pronto para Retirada');

      // OPERADOR tenta estornar -> 403 Forbidden
      const resForbiddenRefund = await request(app)
        .patch(`/api/transactions/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ newStatus: 'Cancelado/Estornado', reason: 'Teste bloqueio' });
      assert.equal(resForbiddenRefund.status, 403);

      // ADMIN estorna -> 200 OK e devolve estoque + saldo
      const beforeRefund = await request(app)
        .get('/api/state')
        .set('Authorization', `Bearer ${adminToken}`);
      const stockBefore = beforeRefund.body.products.find((p) => p.id === 'PROD-001').stock;
      const balanceBefore = beforeRefund.body.customers.find((c) => c.id === 'CLI-001').balance;

      const resRefund = await request(app)
        .patch(`/api/transactions/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newStatus: 'Cancelado/Estornado', reason: 'Teste estorno formal' });

      assert.equal(resRefund.status, 200);
      const stockAfter = resRefund.body.state.products.find((p) => p.id === 'PROD-001').stock;
      const balanceAfter = resRefund.body.state.customers.find((c) => c.id === 'CLI-001').balance;

      assert.equal(stockAfter, stockBefore + 2);
      assert.equal(balanceAfter, Number((balanceBefore + 16.0).toFixed(2)));
    });

    it('T6 - POST /api/transactions/cash-register: ADMIN realiza suprimento, sangria, fechamento (bloqueia vendas) e reabertura', async () => {
      const resSup = await request(app)
        .post('/api/transactions/cash-register')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ operationType: 'SUPRIMENTO', amount: 40, description: 'Troco adicional' });
      assert.equal(resSup.status, 201);

      const resClose = await request(app)
        .post('/api/transactions/cash-register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ operationType: 'FECHAMENTO', description: 'Fechamento de turno teste' });
      assert.equal(resClose.status, 201);
      assert.equal(resClose.body.cashStatus.isOpen, false);

      // Com caixa fechado, venda deve retornar 400 CASH_CLOSED
      const resSaleClosed = await request(app)
        .post('/api/transactions/checkout')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ productId: 'PROD-001', qty: 1 }], paymentMethod: 'PIX' });
      assert.equal(resSaleClosed.status, 400);
      assert.equal(resSaleClosed.body.error, 'CASH_CLOSED');

      // Reabrir caixa
      const resOpen = await request(app)
        .post('/api/transactions/cash-register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ operationType: 'ABERTURA', amount: 100, description: 'Reabertura de turno' });
      assert.equal(resOpen.status, 201);
      assert.equal(resOpen.body.cashStatus.isOpen, true);
    });
  });
});
