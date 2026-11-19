import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'unifor-cantina-pdv-jwt-secret-2026';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Middleware de Autenticação (verifica token Bearer JWT)
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token de autenticação ausente. Faça login para acessar este recurso.'
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role
    };
    return next();
  } catch {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token de autenticação inválido ou expirado. Faça login novamente.'
    });
  }
}

/**
 * Middleware de Autorização Baseada em Papéis (RBAC)
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Usuário não autenticado.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Acesso negado. Esta operação exige perfil [${allowedRoles.join(' ou ')}], mas seu perfil atual é [${req.user.role}].`
      });
    }

    return next();
  };
}
