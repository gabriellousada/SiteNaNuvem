import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLES = {
  PRODUCTS: process.env.PRODUCTS_TABLE || 'UniforCantinaProducts',
  CUSTOMERS: process.env.CUSTOMERS_TABLE || 'UniforCantinaCustomers',
  ORDERS: process.env.ORDERS_TABLE || 'UniforCantinaOrders',
  STOCK: process.env.STOCK_MOVEMENTS_TABLE || 'UniforCantinaStockMovements',
  CASH: process.env.CASH_MOVEMENTS_TABLE || 'UniforCantinaCashMovements'
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

async function fetchAllState() {
  const [products, customers, orders, stockMovements, cashMovements] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: TABLES.PRODUCTS })),
    docClient.send(new ScanCommand({ TableName: TABLES.CUSTOMERS })),
    docClient.send(new ScanCommand({ TableName: TABLES.ORDERS })),
    docClient.send(new ScanCommand({ TableName: TABLES.STOCK })),
    docClient.send(new ScanCommand({ TableName: TABLES.CASH }))
  ]);

  return {
    products: products.Items || [],
    customers: customers.Items || [],
    orders: (orders.Items || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    stockMovements: (stockMovements.Items || []).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    ),
    cashMovements: (cashMovements.Items || []).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    ),
    cashStatus: { isOpen: true, operator: 'Operador Caixa AWS' }
  };
}

export async function router(event) {
  try {
    const path = event.rawPath || event.path || '';
    const body = event.body ? JSON.parse(event.body) : {};

    if (path.endsWith('/state')) {
      const state = await fetchAllState();
      return jsonResponse(200, state);
    }

    // TRANSAÇÃO 1: CHECKOUT DE VENDA NO PDV
    if (path.endsWith('/transactions/checkout')) {
      const { items, customerId, paymentMethod, discount = 0 } = body;
      const subtotal = Number(items.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2));
      const total = Number((subtotal - Number(discount || 0)).toFixed(2));

      for (const item of items) {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.PRODUCTS,
            Key: { id: item.productId },
            UpdateExpression: 'SET stock = stock - :q',
            ExpressionAttributeValues: { ':q': Number(item.qty) }
          })
        );
      }

      if (customerId && paymentMethod === 'Carteira Unifor') {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.CUSTOMERS,
            Key: { id: customerId },
            UpdateExpression: 'SET balance = balance - :val, totalSpent = totalSpent + :val',
            ExpressionAttributeValues: { ':val': total }
          })
        );
      }

      const orderId = `PED-${Date.now().toString().slice(-4)}`;
      const newOrder = {
        id: orderId,
        ficha: `#${orderId.slice(-3)}`,
        createdAt: new Date().toISOString(),
        customerId: customerId || null,
        customerName: body.customerName || 'Cliente Balcão',
        paymentMethod,
        status: 'Em Preparo',
        subtotal,
        discount: Number(discount || 0),
        total,
        items
      };

      await docClient.send(new PutCommand({ TableName: TABLES.ORDERS, Item: newOrder }));
      await docClient.send(
        new PutCommand({
          TableName: TABLES.CASH,
          Item: {
            id: `CX-${Date.now().toString().slice(-4)}`,
            createdAt: new Date().toISOString(),
            type: 'VENDA',
            amount: total,
            paymentMethod,
            description: `Venda ${orderId}`,
            operator: 'Operador Caixa AWS'
          }
        })
      );

      const state = await fetchAllState();
      return jsonResponse(201, {
        order: newOrder,
        state,
        summary: `Venda ${orderId} gravada no DynamoDB`
      });
    }

    // TRANSAÇÃO 2: CADASTRAR OU EDITAR PRODUTO
    if (path.endsWith('/transactions/products')) {
      const product = {
        id: body.id || `PROD-${Date.now().toString().slice(-4)}`,
        sku: String(body.sku).toUpperCase(),
        name: body.name,
        category: body.category || 'Salgados',
        price: Number(body.price),
        cost: Number(body.cost || 0),
        stock: Number(body.stock || 0),
        minStock: Number(body.minStock || 5),
        emoji: body.emoji || '🍔'
      };
      await docClient.send(new PutCommand({ TableName: TABLES.PRODUCTS, Item: product }));
      const state = await fetchAllState();
      return jsonResponse(201, {
        product,
        state,
        summary: `Produto ${product.name} salvo no DynamoDB`
      });
    }

    // TRANSAÇÃO 3: REPOSIÇÃO OU BAIXA DE ESTOQUE
    if (path.endsWith('/transactions/stock-movements')) {
      const { productId, type, quantity, reason } = body;
      const qty = Number(quantity);
      const delta = type === 'ENTRADA' ? qty : -qty;

      const updated = await docClient.send(
        new UpdateCommand({
          TableName: TABLES.PRODUCTS,
          Key: { id: productId },
          UpdateExpression: 'SET stock = stock + :d',
          ExpressionAttributeValues: { ':d': delta },
          ReturnValues: 'ALL_NEW'
        })
      );

      const movement = {
        id: `MOV-${Date.now().toString().slice(-4)}`,
        createdAt: new Date().toISOString(),
        productId,
        productName: updated.Attributes?.name || productId,
        type,
        quantity: qty,
        reason,
        operator: 'Operador Caixa AWS'
      };

      await docClient.send(new PutCommand({ TableName: TABLES.STOCK, Item: movement }));
      const state = await fetchAllState();
      return jsonResponse(201, {
        movement,
        state,
        summary: `Estoque atualizado no DynamoDB (${type} ${qty} un.)`
      });
    }

    // TRANSAÇÃO 4: CARTEIRA UNIFOR (CADASTRO DE ALUNO & RECARGA)
    if (path.endsWith('/transactions/customers-wallet')) {
      if (body.actionType === 'CREATE_CUSTOMER') {
        const customer = {
          id: `CLI-${Date.now().toString().slice(-4)}`,
          matricula: body.matricula,
          name: body.name,
          course: body.course,
          role: body.role || 'Aluno',
          balance: Number(body.initialDeposit || 0),
          totalSpent: 0
        };
        await docClient.send(new PutCommand({ TableName: TABLES.CUSTOMERS, Item: customer }));
        const state = await fetchAllState();
        return jsonResponse(201, {
          customer,
          state,
          summary: `Cliente ${customer.name} cadastrado no DynamoDB`
        });
      }

      const topup = Number(body.amount);
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.CUSTOMERS,
          Key: { id: body.customerId },
          UpdateExpression: 'SET balance = balance + :v',
          ExpressionAttributeValues: { ':v': topup }
        })
      );
      const state = await fetchAllState();
      return jsonResponse(201, {
        state,
        summary: `Recarga de R$ ${topup.toFixed(2)} registrada no DynamoDB`
      });
    }

    // TRANSAÇÃO 5: STATUS DE PEDIDO E ESTORNO
    if (path.endsWith('/transactions/orders-status')) {
      const { orderId, newStatus, reason } = body;
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.ORDERS,
          Key: { id: orderId },
          UpdateExpression: 'SET #st = :s, cancelReason = :r',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':s': newStatus, ':r': reason || '' }
        })
      );
      const state = await fetchAllState();
      return jsonResponse(200, {
        state,
        summary: `Pedido ${orderId} atualizado para ${newStatus}`
      });
    }

    // TRANSAÇÃO 6: OPERAÇÃO DE CAIXA
    if (path.endsWith('/transactions/cash-register')) {
      const { operationType, amount, description, operator } = body;
      const signedAmount =
        operationType === 'SANGRIA' ? -Math.abs(Number(amount)) : Math.abs(Number(amount || 0));
      await docClient.send(
        new PutCommand({
          TableName: TABLES.CASH,
          Item: {
            id: `CX-${Date.now().toString().slice(-4)}`,
            createdAt: new Date().toISOString(),
            type: operationType,
            amount: signedAmount,
            paymentMethod: 'Dinheiro',
            description,
            operator: operator || 'Operador Caixa AWS'
          }
        })
      );
      const state = await fetchAllState();
      return jsonResponse(201, {
        state,
        summary: `Operação de caixa ${operationType} gravada no DynamoDB`
      });
    }

    return jsonResponse(404, { message: `Rota não encontrada: ${path}` });
  } catch (err) {
    return jsonResponse(500, { message: err.message });
  }
}
