export const INITIAL_PRODUCTS = [
  {
    id: 'PROD-001',
    sku: 'SALG-01',
    name: 'Coxinha de Frango com Catupiry (Bloco D)',
    category: 'Salgados',
    price: 8.50,
    cost: 3.80,
    stock: 42,
    minStock: 10,
    emoji: '🍗'
  },
  {
    id: 'PROD-002',
    sku: 'SALG-02',
    name: 'Pastel Assado de Carne de Sol e Nata',
    category: 'Salgados',
    price: 9.00,
    cost: 4.10,
    stock: 28,
    minStock: 8,
    emoji: '🥟'
  },
  {
    id: 'PROD-003',
    sku: 'SALG-03',
    name: 'Pão de Queijo Mineiro Grande',
    category: 'Salgados',
    price: 6.00,
    cost: 2.20,
    stock: 7,
    minStock: 12,
    emoji: '🧀'
  },
  {
    id: 'PROD-004',
    sku: 'LANC-01',
    name: 'Tapioca de Queijo Coalho com Peito de Peru',
    category: 'Lanches & Tapiocas',
    price: 13.50,
    cost: 5.90,
    stock: 19,
    minStock: 6,
    emoji: '🌮'
  },
  {
    id: 'PROD-005',
    sku: 'LANC-02',
    name: 'Sanduíche Natural no Pão Integral',
    category: 'Lanches & Tapiocas',
    price: 12.00,
    cost: 5.20,
    stock: 15,
    minStock: 5,
    emoji: '🥪'
  },
  {
    id: 'PROD-006',
    sku: 'BEB-01',
    name: 'Suco Natural da Polpa 400ml (Cajá / Acerola)',
    category: 'Bebidas',
    price: 7.50,
    cost: 2.50,
    stock: 35,
    minStock: 10,
    emoji: '🧃'
  },
  {
    id: 'PROD-007',
    sku: 'BEB-02',
    name: 'Café Expresso Duplo Especial',
    category: 'Bebidas',
    price: 5.50,
    cost: 1.40,
    stock: 60,
    minStock: 15,
    emoji: '☕'
  },
  {
    id: 'PROD-008',
    sku: 'BEB-03',
    name: 'Refrigerante Lata 350ml (Vários Sabores)',
    category: 'Bebidas',
    price: 6.50,
    cost: 3.10,
    stock: 5,
    minStock: 12,
    emoji: '🥤'
  },
  {
    id: 'PROD-009',
    sku: 'DOCE-01',
    name: 'Tigela de Açaí Universitário 300ml + Granola',
    category: 'Doces & Açaí',
    price: 16.00,
    cost: 7.50,
    stock: 22,
    minStock: 6,
    emoji: '🍨'
  },
  {
    id: 'PROD-010',
    sku: 'COMB-01',
    name: 'Combo Intervalo (Salgado + Suco 400ml)',
    category: 'Combos',
    price: 14.50,
    cost: 6.30,
    stock: 25,
    minStock: 8,
    emoji: '🍱'
  }
];

export const INITIAL_CUSTOMERS = [
  {
    id: 'CLI-001',
    matricula: '2310458',
    name: 'Gabriel Oliveira',
    course: 'Ciência da Computação - CCT',
    role: 'Aluno',
    balance: 45.00,
    totalSpent: 128.50
  },
  {
    id: 'CLI-002',
    matricula: '2220891',
    name: 'Marina Cavalcante',
    course: 'Engenharia de Software - CCT',
    role: 'Aluno',
    balance: 22.50,
    totalSpent: 89.00
  },
  {
    id: 'CLI-003',
    matricula: '1980112',
    name: 'Prof. Carlos Eduardo',
    course: 'Docente - Bloco M / D',
    role: 'Professor',
    balance: 110.00,
    totalSpent: 340.00
  },
  {
    id: 'CLI-004',
    matricula: '2410339',
    name: 'Lucas Mendes',
    course: 'Direito - CCJ',
    role: 'Aluno',
    balance: 8.00,
    totalSpent: 54.00
  }
];

export const INITIAL_ORDERS = [
  {
    id: 'PED-1041',
    ficha: '#041',
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    customerName: 'Gabriel Oliveira (2310458)',
    customerId: 'CLI-001',
    paymentMethod: 'Carteira Unifor',
    status: 'Entregue',
    subtotal: 16.00,
    discount: 0,
    total: 16.00,
    items: [
      { productId: 'PROD-001', name: 'Coxinha de Frango com Catupiry (Bloco D)', price: 8.50, qty: 1 },
      { productId: 'PROD-006', name: 'Suco Natural da Polpa 400ml (Cajá / Acerola)', price: 7.50, qty: 1 }
    ]
  },
  {
    id: 'PED-1042',
    ficha: '#042',
    createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
    customerName: 'Marina Cavalcante (2220891)',
    customerId: 'CLI-002',
    paymentMethod: 'PIX',
    status: 'Pronto para Retirada',
    subtotal: 19.00,
    discount: 0,
    total: 19.00,
    items: [
      { productId: 'PROD-004', name: 'Tapioca de Queijo Coalho com Peito de Peru', price: 13.50, qty: 1 },
      { productId: 'PROD-007', name: 'Café Expresso Duplo Especial', price: 5.50, qty: 1 }
    ]
  },
  {
    id: 'PED-1043',
    ficha: '#043',
    createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
    customerName: 'Cliente Balcão',
    customerId: null,
    paymentMethod: 'Cartão Débito/Crédito',
    status: 'Em Preparo',
    subtotal: 16.00,
    discount: 0,
    total: 16.00,
    items: [
      { productId: 'PROD-009', name: 'Tigela de Açaí Universitário 300ml + Granola', price: 16.00, qty: 1 }
    ]
  }
];

export const INITIAL_STOCK_MOVEMENTS = [
  {
    id: 'MOV-EST-01',
    createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
    productId: 'PROD-001',
    productName: 'Coxinha de Frango com Catupiry (Bloco D)',
    type: 'ENTRADA',
    quantity: 30,
    reason: 'Fornada da manhã - Cozinha Central',
    operator: 'Caixa 01'
  },
  {
    id: 'MOV-EST-02',
    createdAt: new Date(Date.now() - 80 * 60000).toISOString(),
    productId: 'PROD-006',
    productName: 'Suco Natural da Polpa 400ml (Cajá / Acerola)',
    type: 'ENTRADA',
    quantity: 20,
    reason: 'Reposição fornecedor Polpas Nordeste',
    operator: 'Caixa 01'
  }
];

export const INITIAL_CASH_MOVEMENTS = [
  {
    id: 'CX-001',
    createdAt: new Date(Date.now() - 180 * 60000).toISOString(),
    type: 'ABERTURA',
    amount: 150.00,
    paymentMethod: 'Dinheiro',
    description: 'Fundo de troco inicial - Turno Manhã/Tarde',
    operator: 'Operador Caixa 01'
  },
  {
    id: 'CX-002',
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    type: 'VENDA',
    amount: 16.00,
    paymentMethod: 'Carteira Unifor',
    description: 'Venda PED-1041 (#041) - Gabriel Oliveira',
    operator: 'Operador Caixa 01'
  },
  {
    id: 'CX-003',
    createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
    type: 'VENDA',
    amount: 19.00,
    paymentMethod: 'PIX',
    description: 'Venda PED-1042 (#042) - Marina Cavalcante',
    operator: 'Operador Caixa 01'
  },
  {
    id: 'CX-004',
    createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
    type: 'VENDA',
    amount: 16.00,
    paymentMethod: 'Cartão Débito/Crédito',
    description: 'Venda PED-1043 (#043) - Cliente Balcão',
    operator: 'Operador Caixa 01'
  }
];
