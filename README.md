# Sistema PDV Cantina Unifor • React + AWS Cloud Serverless

Sistema de Ponto de Venda (PDV) para a **Cantina da Universidade de Fortaleza (Unifor)**, desenvolvido em **HTML5, CSS3, JavaScript (ES6+) e React 18**, integrado a uma arquitetura **Full Serverless na AWS (Amazon API Gateway, AWS Lambda e Amazon DynamoDB)**, contando também com um **Simulador Local AWS Serverless** para execução e avaliação imediata sem custos.

---

## 1. Atendimento aos Requisitos e as 6 Transações Implementadas

O sistema contempla **6 transações completas de negócio** (atendendo tanto ao requisito mínimo de equipes de até 2 pessoas quanto ao requisito de 6 transações para trabalho individual):

| # | Transação (Feature) | Ação Executada pelo Usuário | Rota API Gateway / Função Lambda | Tabelas DynamoDB Afetadas |
|---|---|---|---|---|
| **T1** | **Realizar Venda no PDV (Checkout)** | Seleciona produtos do cardápio, vincula matrícula (opcional), aplica desconto, escolhe meio de pagamento (`PIX`, `Carteira Unifor`, `Cartão`, `Dinheiro` com cálculo de troco), abate o estoque automaticamente, debita o saldo do aluno e emite a Ficha/Comprovante. | `POST /transactions/checkout` (`CheckoutSaleLambda`) | `UniforCantinaOrders`, `UniforCantinaProducts`, `UniforCantinaCustomers`, `UniforCantinaCashMovements` |
| **T2** | **Cadastrar e Editar Produto do Cardápio** | Cadastra novos salgados, bebidas, lanches ou combos com SKU, preço de venda, custo unitário, cálculo automático de margem de lucro, estoque inicial e estoque mínimo de alerta, ou edita itens existentes. | `POST /transactions/products` (`UpsertProductLambda`) | `UniforCantinaProducts` |
| **T3** | **Reposição e Baixa de Estoque** | Registra entrada de mercadorias (fornada/fornecedor) ou saída por perda/avaria/consumo interno, atualizando o saldo de estoque do produto e gravando o log de rastreabilidade. | `POST /transactions/stock-movements` (`AdjustStockLambda`) | `UniforCantinaProducts`, `UniforCantinaStockMovements` |
| **T4** | **Carteira Unifor (Cadastro de Aluno & Recarga)** | Cadastra alunos/professores com Matrícula Unifor e curso, e realiza recargas pré-pagas na Carteira Digital da Cantina, refletindo a entrada financeira no caixa. | `POST /transactions/customers-wallet` (`CustomerWalletLambda`) | `UniforCantinaCustomers`, `UniforCantinaCashMovements` |
| **T5** | **Fila de Pedidos da Cozinha & Estorno de Venda** | Avança o status operacional do pedido (`Em Preparo` → `Pronto para Retirada` → `Entregue`) ou realiza o **Estorno/Cancelamento** da venda (devolvendo automaticamente os itens ao estoque e restituindo o saldo da Carteira Unifor). | `POST /transactions/orders-status` (`OrderFulfillmentLambda`) | `UniforCantinaOrders`, `UniforCantinaProducts`, `UniforCantinaCustomers`, `UniforCantinaCashMovements` |
| **T6** | **Operação de Caixa e Turno** | Executa Abertura de Caixa (fundo de troco), Suprimento (reforço de cédulas), Sangria (retirada para cofre) e Fechamento de Turno no Livro Razão do Caixa. | `POST /transactions/cash-register` (`CashRegisterOperationLambda`) | `UniforCantinaCashMovements` |

---

## 2. Como Executar Localmente (Desenvolvimento / Apresentação)

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`. Por padrão, o sistema inicia com o **Simulador Local AWS Serverless** ativo e populado com dados realistas da Cantina da Unifor, exibindo no rodapé o console **AWS CloudWatch Live Telemetry** a cada transação executada.

---

## 3. Como Fazer o Deploy na Nuvem AWS

### Pré-requisitos
1. Conta na AWS (compatível com **AWS Free Tier**).
2. [AWS CLI](https://aws.amazon.com/cli/) configurada (`aws configure`).
3. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) instalada.

### Opção A: Deploy Automatizado via Script PowerShell
No Windows PowerShell, na raiz do projeto:

```powershell
.\deploy-aws.ps1 -StackName "pdv-cantina-unifor-stack" -Region "us-east-1"
```

### Opção B: Passo a Passo Manual (Backend + Frontend)

#### 1. Deploy do Backend (DynamoDB + Lambda + API Gateway)
```bash
cd aws-backend/src
npm install
cd ..
sam build
sam deploy --guided
```
Ao final do deploy, o CloudFormation exibirá o output `ApiGatewayEndpoint` (ex.: `https://a1b2c3d4.execute-api.us-east-1.amazonaws.com/prod`).

#### 2. Conectar o Frontend React ao API Gateway
Você pode conectar de duas formas:
- **Pela própria interface gráfica do sistema**: clique na aba **AWS (Arquitetura Nuvem AWS)**, altere o modo para **AWS Cloud Real**, cole a URL do `ApiGatewayEndpoint` e clique em **Salvar Configuração AWS**.
- **Via variável de ambiente no build**: crie um arquivo `.env` na raiz com `VITE_AWS_API_URL=https://sua-api.execute-api.us-east-1.amazonaws.com/prod` e rode `npm run build`.

#### 3. Hospedar o Frontend React na AWS (AWS Amplify ou S3 + CloudFront)
- **Via AWS Amplify Console**: conecte seu repositório Git ao AWS Amplify. O arquivo `amplify.yml` na raiz já configura o build automático da pasta `dist/`.
- **Via Amazon S3**:
  ```bash
  npm run build
  aws s3 mb s3://pdv-cantina-unifor-web
  aws s3 website s3://pdv-cantina-unifor-web/ --index-document index.html --error-document index.html
  aws s3 sync dist/ s3://pdv-cantina-unifor-web --delete
  ```
