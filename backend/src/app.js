import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './routes/authRoutes.js';
import { createCantinaRouter } from './routes/cantinaRoutes.js';

export function createApp(db) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check público do Web Service REST
  app.get('/api/health', (req, res) => {
    const productCount = db.get('SELECT COUNT(*) as count FROM products')?.count || 0;
    return res.status(200).json({
      status: 'UP',
      service: 'PDV Cantina Unifor REST API',
      database: 'SQLite',
      productsLoaded: productCount,
      timestamp: new Date().toISOString()
    });
  });

  // Rotas de Autenticação e Autorização
  app.use('/api/auth', createAuthRouter(db));

  // Rotas REST das 6 Transações de Negócio (protegidas por JWT + RBAC)
  app.use('/api', createCantinaRouter(db));

  // Tratamento de rota inexistente (404)
  app.use((req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Rota REST não encontrada: ${req.method} ${req.originalUrl}`
    });
  });

  return app;
}
