import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken, authorizeRoles, signUserToken } from '../middleware/auth.js';

export function createAuthRouter(db) {
  const router = Router();

  // POST /api/auth/login — Autenticação com e-mail e senha
  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Informe e-mail e senha para realizar o login.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.get(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.'
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = signUserToken(safeUser);
    return res.status(200).json({
      token,
      user: safeUser,
      message: `Bem-vindo(a), ${safeUser.name}!`
    });
  });

  // POST /api/auth/register — Cadastro de novo usuário (por padrão perfil OPERADOR)
  router.post('/register', (req, res) => {
    const { name, email, password, role = 'OPERADOR' } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Preencha nome, e-mail e senha.'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'A senha deve possuir no mínimo 6 caracteres.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const validRole = role === 'ADMIN' ? 'ADMIN' : 'OPERADOR';

    const existing = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({
        error: 'EMAIL_EXISTS',
        message: 'Já existe um usuário cadastrado com este e-mail.'
      });
    }

    const count = db.get('SELECT COUNT(*) as count FROM users')?.count || 0;
    const newId = `USR-${String(count + 1).padStart(3, '0')}`;
    const passwordHash = bcrypt.hashSync(String(password), 8);
    const now = new Date().toISOString();

    db.transaction(() => {
      db.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId, String(name).trim(), normalizedEmail, passwordHash, validRole, now]
      );
    });

    const safeUser = {
      id: newId,
      name: String(name).trim(),
      email: normalizedEmail,
      role: validRole
    };

    const token = signUserToken(safeUser);
    return res.status(201).json({
      token,
      user: safeUser,
      message: `Usuário ${safeUser.name} (${safeUser.role}) cadastrado com sucesso.`
    });
  });

  // GET /api/auth/me — Retorna sessão autenticada
  router.get('/me', authenticateToken, (req, res) => {
    return res.status(200).json({ user: req.user });
  });

  // GET /api/auth/users — Lista usuários cadastrados (somente ADMIN)
  router.get('/users', authenticateToken, authorizeRoles('ADMIN'), (req, res) => {
    const users = db.all(
      'SELECT id, name, email, role, created_at as createdAt FROM users ORDER BY created_at ASC'
    );
    return res.status(200).json({ users });
  });

  return router;
}
