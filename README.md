# Sistema PDV Cantina Unifor — Full Stack (React + Node.js REST + SQLite + JWT/RBAC + Testes Formais)

Sistema de Ponto de Venda (PDV) para a **Cantina da Universidade de Fortaleza (Unifor)**, atendendo integralmente aos requisitos de Frontend, Backend, Controle de Acesso, SGBD, Controle de Versão e Testes Formais.

---

## 1. Requisitos Atendidos

| Requisito | Implementação no Projeto |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) e **React 18** com Vite (`index.html`, `src/App.jsx`, `src/styles.css`, `src/services/awsApi.js`), publicado na nuvem via **AWS Amplify**. |
| **Backend (Web Service REST & Rotas)** | **Node.js + Express** (`backend/src/app.js`, `backend/src/routes/authRoutes.js`, `backend/src/routes/cantinaRoutes.js`) com rotas REST completas (`GET`, `POST`, `PATCH`) e códigos HTTP padronizados (`200`, `201`, `400`, `401`, `403`, `404`, `409`). |
| **Controle de Acesso (Autenticação e Autorização)** | **Autenticação JWT** (`jsonwebtoken`) + senhas protegidas com hash **bcrypt** (`bcryptjs`) + **Autorização RBAC** (`ADMIN` e `OPERADOR`) via middlewares `authenticateToken` e `authorizeRoles` (`backend/src/middleware/auth.js`). |
| **SGBD Relacional** | **SQLite** (`backend/src/db/database.js`) com schema relacional (8 tabelas com chaves primárias, estrangeiras e transações SQL atômicas) persistido em `backend/database/cantina.sqlite`. |
| **6 Transações de Negócio** | T1 (Checkout/Venda PDV), T2 (Cadastro/Edição de Produto), T3 (Reposição/Baixa de Estoque), T4 (Cadastro de Aluno e Recarga de Carteira Unifor), T5 (Fila da Cozinha e Estorno de Venda) e T6 (Operações de Caixa e Turno). |
| **Testes Formais nos Serviços** | Suíte automatizada de **13 testes formais de integração HTTP** usando `node:test`, `node:assert` e **Supertest** contra banco SQLite isolado em memória (`backend/tests/api.test.js`). |
| **Controle de Versão** | **Git + GitHub** (`https://github.com/gabriellousada/SiteNaNuvem.git`). |

---

## 2. Controle de Acesso (Usuários Padrão & Matriz de Autorização)

| Perfil | E-mail | Senha | Permissões (RBAC) |
|---|---|---|---|
| **ADMIN (Gerente)** | `admin@unifor.br` | `admin123` | Acesso total a todas as rotas e transações (T1 a T6), estorno de vendas, sangria/fechamento de caixa, gestão de produtos/estoque e listagem de usuários. |
| **OPERADOR (Caixa)** | `caixa@unifor.br` | `caixa123` | Pode executar vendas (T1), recargas/cadastro de alunos (T4), avançar fila da cozinha (T5) e suprimento/abertura de caixa (T6). Recebe **HTTP 403 Forbidden** em T2, T3, Estorno (T5) e Sangria/Fechamento (T6). |

Também é possível criar novos usuários pela tela **Criar Conta** (`POST /api/auth/register`).

---

## 3. Mapa de Rotas do Web Service REST (`http://localhost:3001`)

| Método | Rota | Autenticação / Perfil | Descrição |
|---|---|---|---|
| `GET` | `/api/health` | Público | Health check do serviço REST e status do SQLite |
| `POST` | `/api/auth/login` | Público | Autentica usuário e emite token JWT |
| `POST` | `/api/auth/register` | Público | Cadastra novo usuário com hash bcrypt e emite JWT |
| `GET` | `/api/auth/me` | JWT (`ADMIN`, `OPERADOR`) | Retorna dados do usuário autenticado |
| `GET` | `/api/auth/users` | JWT (`ADMIN`) | Lista usuários cadastrados no banco |
| `GET` | `/api/state` | JWT (`ADMIN`, `OPERADOR`) | Retorna estado consolidado (produtos, clientes, pedidos, caixa) |
| `POST` | `/api/transactions/checkout` | JWT (`ADMIN`, `OPERADOR`) | **T1** — Efetua venda, abate estoque, debita Carteira Unifor e lança no caixa |
| `POST` | `/api/transactions/products` | JWT (`ADMIN`) | **T2** — Cadastra ou edita produto no cardápio |
| `POST` | `/api/transactions/stock-movements` | JWT (`ADMIN`) | **T3** — Registra entrada (reposição) ou saída (baixa) de estoque |
| `POST` | `/api/transactions/customers-wallet` | JWT (`ADMIN`, `OPERADOR`) | **T4** — Cadastra aluno/professor ou recarrega saldo da Carteira Unifor |
| `PATCH` | `/api/transactions/orders/:id/status` | JWT (`OPERADOR` fila / `ADMIN` estorno) | **T5** — Avança status na cozinha ou estorna venda devolvendo estoque e saldo |
| `POST` | `/api/transactions/cash-register` | JWT (`OPERADOR` abertura/suprimento / `ADMIN` sangria/fechamento) | **T6** — Registra abertura, suprimento, sangria ou fechamento de caixa |

---

## 4. Como Executar o Projeto Localmente

### 1. Instalar dependências (Frontend + Backend)
```bash
npm install
npm --prefix backend install
```

### 2. Executar o Backend Node.js REST + SQLite (Terminal 1)
```bash
npm run backend
```
O Web Service REST ficará disponível em `http://localhost:3001`.

### 3. Executar o Frontend React (Terminal 2)
```bash
npm run dev
```
Acesse `http://localhost:5173`. O proxy do Vite redireciona `/api` automaticamente para o backend Node.js na porta `3001`.

---

## 5. Como Executar os Testes Formais dos Serviços

```bash
npm run test:backend
```

A suíte (`backend/tests/api.test.js`) executa **13 testes formais automatizados**, validando:
- Disponibilidade do serviço (`/api/health`) e schema SQLite;
- Bloqueio sem token (`401 Unauthorized`), login inválido (`401`), login válido com JWT (`200`) e cadastro com proteção contra duplicidade (`201`/`409`);
- Autorização RBAC bloqueando `OPERADOR` em rotas exclusivas de `ADMIN` (`403 Forbidden`);
- Fluxo completo e regras de validação de todas as **6 transações (T1 a T6)** com integridade transacional no SQLite.
