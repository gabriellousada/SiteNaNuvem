import { createDatabase } from './db/database.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap() {
  const db = await createDatabase({ memory: false });
  const app = createApp(db);

  app.listen(PORT, () => {
    console.log(`[PDV Cantina Unifor] Web Service REST rodando em http://localhost:${PORT}`);
    console.log('[SGBD] SQLite inicializado em backend/database/cantina.sqlite');
    console.log('[Auth] Contas iniciais: admin@unifor.br / admin123 (ADMIN) | caixa@unifor.br / caixa123 (OPERADOR)');
  });
}

bootstrap().catch((err) => {
  console.error('Erro ao iniciar o servidor backend:', err);
  process.exit(1);
});
