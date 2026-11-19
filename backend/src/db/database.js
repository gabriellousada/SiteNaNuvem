import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../database/cantina.sqlite');

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OPERADOR')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    emoji TEXT NOT NULL DEFAULT '🍔',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    matricula TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    course TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Aluno',
    balance REAL NOT NULL DEFAULT 0,
    total_spent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    ficha TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    cash_received REAL NOT NULL DEFAULT 0,
    change_amount REAL NOT NULL DEFAULT 0,
    cancel_reason TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    qty INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ENTRADA', 'SAIDA')),
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    operator TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    description TEXT NOT NULL,
    operator TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cash_register_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_open INTEGER NOT NULL DEFAULT 1,
    opened_at TEXT,
    closed_at TEXT,
    operator TEXT NOT NULL
  );
`;

export class CantinaDatabase {
  constructor(sqlDb, dbFilePath = null) {
    this.db = sqlDb;
    this.dbFilePath = dbFilePath;
  }

  save() {
    if (!this.dbFilePath) return;
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = this.db.export();
    fs.writeFileSync(this.dbFilePath, Buffer.from(data));
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  transaction(fn) {
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.save();
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  seedInitialData(forceReset = false) {
    if (forceReset) {
      this.db.run('DELETE FROM order_items');
      this.db.run('DELETE FROM orders');
      this.db.run('DELETE FROM stock_movements');
      this.db.run('DELETE FROM cash_movements');
      this.db.run('DELETE FROM products');
      this.db.run('DELETE FROM customers');
      this.db.run('DELETE FROM cash_register_status');
    }

    const now = new Date().toISOString();

    // Seed usuários padrão (somente se tabela users estiver vazia)
    const userCount = this.get('SELECT COUNT(*) as count FROM users')?.count || 0;
    if (userCount === 0) {
      const adminHash = bcrypt.hashSync('admin123', 8);
      const caixaHash = bcrypt.hashSync('caixa123', 8);

      this.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['USR-001', 'Gerente Cantina Unifor', 'admin@unifor.br', adminHash, 'ADMIN', now]
      );
      this.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['USR-002', 'Operador Caixa 01', 'caixa@unifor.br', caixaHash, 'OPERADOR', now]
      );
    }

    const productCount = this.get('SELECT COUNT(*) as count FROM products')?.count || 0;
    if (productCount === 0) {
      const initialProducts = [
        ['PROD-001', 'SALG-01', 'Coxinha de Frango com Catupiry (Bloco D)', 'Salgados', 8.5, 3.8, 42, 10, '🍗'],
        ['PROD-002', 'SALG-02', 'Pastel Assado de Carne de Sol e Nata', 'Salgados', 9.0, 4.1, 28, 8, '🥟'],
        ['PROD-003', 'SALG-03', 'Pão de Queijo Mineiro Grande', 'Salgados', 6.0, 2.2, 7, 12, '🧀'],
        ['PROD-004', 'LANC-01', 'Tapioca de Queijo Coalho com Peito de Peru', 'Lanches & Tapiocas', 13.5, 5.9, 19, 6, '🌮'],
        ['PROD-005', 'LANC-02', 'Sanduíche Natural no Pão Integral', 'Lanches & Tapiocas', 12.0, 5.2, 15, 5, '🥪'],
        ['PROD-006', 'BEB-01', 'Suco Natural da Polpa 400ml (Cajá / Acerola)', 'Bebidas', 7.5, 2.5, 35, 10, '🧃'],
        ['PROD-007', 'BEB-02', 'Café Expresso Duplo Especial', 'Bebidas', 5.5, 1.4, 60, 15, '☕'],
        ['PROD-008', 'BEB-03', 'Refrigerante Lata 350ml (Vários Sabores)', 'Bebidas', 6.5, 3.1, 5, 12, '🥤'],
        ['PROD-009', 'DOCE-01', 'Tigela de Açaí Universitário 300ml + Granola', 'Doces & Açaí', 16.0, 7.5, 22, 6, '🍨'],
        ['PROD-010', 'COMB-01', 'Combo Intervalo (Salgado + Suco 400ml)', 'Combos', 14.5, 6.3, 25, 8, '🍱']
      ];

      for (const p of initialProducts) {
        this.run(
          `INSERT INTO products (id, sku, name, category, price, cost, stock, min_stock, emoji, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...p, now]
        );
      }

      const initialCustomers = [
        ['CLI-001', '2310458', 'Gabriel Oliveira', 'Ciência da Computação - CCT', 'Aluno', 45.0, 128.5],
        ['CLI-002', '2220891', 'Marina Cavalcante', 'Engenharia de Software - CCT', 'Aluno', 22.5, 89.0],
        ['CLI-003', '1980112', 'Prof. Carlos Eduardo', 'Docente - Bloco M / D', 'Professor', 110.0, 340.0],
        ['CLI-004', '2410339', 'Lucas Mendes', 'Direito - CCJ', 'Aluno', 8.0, 54.0]
      ];

      for (const c of initialCustomers) {
        this.run(
          `INSERT INTO customers (id, matricula, name, course, role, balance, total_spent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [...c, now]
        );
      }

      const t45 = new Date(Date.now() - 45 * 60000).toISOString();
      const t18 = new Date(Date.now() - 18 * 60000).toISOString();
      const t6 = new Date(Date.now() - 6 * 60000).toISOString();
      const t120 = new Date(Date.now() - 120 * 60000).toISOString();
      const t80 = new Date(Date.now() - 80 * 60000).toISOString();
      const t180 = new Date(Date.now() - 180 * 60000).toISOString();

      this.run(
        `INSERT INTO orders (id, ficha, customer_id, customer_name, payment_method, status, subtotal, discount, total, cash_received, change_amount, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['PED-1041', '#041', 'CLI-001', 'Gabriel Oliveira (2310458)', 'Carteira Unifor', 'Entregue', 16.0, 0, 16.0, 16.0, 0, 'Operador Caixa 01', t45]
      );
      this.run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
        ['PED-1041', 'PROD-001', 'Coxinha de Frango com Catupiry (Bloco D)', 8.5, 1]
      );
      this.run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
        ['PED-1041', 'PROD-006', 'Suco Natural da Polpa 400ml (Cajá / Acerola)', 7.5, 1]
      );

      this.run(
        `INSERT INTO orders (id, ficha, customer_id, customer_name, payment_method, status, subtotal, discount, total, cash_received, change_amount, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['PED-1042', '#042', 'CLI-002', 'Marina Cavalcante (2220891)', 'PIX', 'Pronto para Retirada', 19.0, 0, 19.0, 19.0, 0, 'Operador Caixa 01', t18]
      );
      this.run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
        ['PED-1042', 'PROD-004', 'Tapioca de Queijo Coalho com Peito de Peru', 13.5, 1]
      );
      this.run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
        ['PED-1042', 'PROD-007', 'Café Expresso Duplo Especial', 5.5, 1]
      );

      this.run(
        `INSERT INTO orders (id, ficha, customer_id, customer_name, payment_method, status, subtotal, discount, total, cash_received, change_amount, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['PED-1043', '#043', null, 'Cliente Balcão', 'Cartão Débito/Crédito', 'Em Preparo', 16.0, 0, 16.0, 16.0, 0, 'Operador Caixa 01', t6]
      );
      this.run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)',
        ['PED-1043', 'PROD-009', 'Tigela de Açaí Universitário 300ml + Granola', 16.0, 1]
      );

      this.run(
        `INSERT INTO stock_movements (id, product_id, product_name, type, quantity, reason, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['MOV-EST-01', 'PROD-001', 'Coxinha de Frango com Catupiry (Bloco D)', 'ENTRADA', 30, 'Fornada da manhã - Cozinha Central', 'Gerente Cantina Unifor', t120]
      );
      this.run(
        `INSERT INTO stock_movements (id, product_id, product_name, type, quantity, reason, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['MOV-EST-02', 'PROD-006', 'Suco Natural da Polpa 400ml (Cajá / Acerola)', 'ENTRADA', 20, 'Reposição fornecedor Polpas Nordeste', 'Gerente Cantina Unifor', t80]
      );

      this.run(
        `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['CX-001', 'ABERTURA', 150.0, 'Dinheiro', 'Fundo de troco inicial - Turno Manhã/Tarde', 'Operador Caixa 01', t180]
      );
      this.run(
        `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['CX-002', 'VENDA', 16.0, 'Carteira Unifor', 'Venda PED-1041 (#041) - Gabriel Oliveira', 'Operador Caixa 01', t45]
      );
      this.run(
        `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['CX-003', 'VENDA', 19.0, 'PIX', 'Venda PED-1042 (#042) - Marina Cavalcante', 'Operador Caixa 01', t18]
      );
      this.run(
        `INSERT INTO cash_movements (id, type, amount, payment_method, description, operator, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['CX-004', 'VENDA', 16.0, 'Cartão Débito/Crédito', 'Venda PED-1043 (#043) - Cliente Balcão', 'Operador Caixa 01', t6]
      );

      this.run(
        'INSERT INTO cash_register_status (id, is_open, opened_at, closed_at, operator) VALUES (1, 1, ?, NULL, ?)',
        [t180, 'Operador Caixa 01']
      );
    }

    this.save();
  }

  getFullState() {
    const products = this.all(
      'SELECT id, sku, name, category, price, cost, stock, min_stock as minStock, emoji FROM products ORDER BY id ASC'
    );
    const customers = this.all(
      'SELECT id, matricula, name, course, role, balance, total_spent as totalSpent FROM customers ORDER BY created_at DESC, id ASC'
    );
    const rawOrders = this.all(
      `SELECT id, ficha, customer_id as customerId, customer_name as customerName,
              payment_method as paymentMethod, status, subtotal, discount, total,
              cash_received as cashReceived, change_amount as change, cancel_reason as cancelReason,
              created_by as createdBy, created_at as createdAt
       FROM orders ORDER BY created_at DESC`
    );

    const allItems = this.all(
      'SELECT order_id as orderId, product_id as productId, product_name as name, unit_price as price, qty FROM order_items'
    );
    const itemsByOrder = {};
    for (const item of allItems) {
      if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = [];
      itemsByOrder[item.orderId].push({
        productId: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty
      });
    }

    const orders = rawOrders.map((o) => ({
      ...o,
      items: itemsByOrder[o.id] || []
    }));

    const stockMovements = this.all(
      `SELECT id, product_id as productId, product_name as productName, type, quantity, reason, operator, created_at as createdAt
       FROM stock_movements ORDER BY created_at DESC`
    );

    const cashMovements = this.all(
      `SELECT id, type, amount, payment_method as paymentMethod, description, operator, created_at as createdAt
       FROM cash_movements ORDER BY created_at DESC`
    );

    const cashStatusRow = this.get(
      'SELECT is_open as isOpen, opened_at as openedAt, closed_at as closedAt, operator FROM cash_register_status WHERE id = 1'
    );

    return {
      products,
      customers,
      orders,
      stockMovements,
      cashMovements,
      cashStatus: cashStatusRow
        ? {
            isOpen: Boolean(cashStatusRow.isOpen),
            openedAt: cashStatusRow.openedAt,
            closedAt: cashStatusRow.closedAt,
            operator: cashStatusRow.operator
          }
        : { isOpen: true, operator: 'Operador Caixa 01' }
    };
  }

  close() {
    this.db.close();
  }
}

export async function createDatabase({ memory = false, filePath = DEFAULT_DB_PATH } = {}) {
  const SQL = await initSqlJs();
  let sqlDb;
  let effectivePath = memory ? null : filePath;

  if (!memory && fs.existsSync(effectivePath)) {
    const fileBuffer = fs.readFileSync(effectivePath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(SCHEMA_SQL);
  const instance = new CantinaDatabase(sqlDb, effectivePath);
  instance.seedInitialData(false);
  return instance;
}
