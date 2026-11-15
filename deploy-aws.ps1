# Script de Deploy Automatizado na AWS (Backend SAM + Frontend S3)
param(
    [string]$StackName = "pdv-cantina-unifor-stack",
    [string]$Region = "us-east-1",
    [string]$FrontendBucket = ""
)

Write-Host "=== 1. Empacotando e Fazendo Deploy do Backend Serverless (AWS SAM) ===" -ForegroundColor Cyan
Push-Location "aws-backend/src"
npm install
Pop-Location

Push-Location "aws-backend"
sam build
sam deploy --stack-name $StackName --region $Region --capabilities CAPABILITY_IAM --resolve-s3 --no-confirm-changeset
$ApiUrl = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayEndpoint'].OutputValue" --output text
Pop-Location

Write-Host "Endpoint API Gateway criado: $ApiUrl" -ForegroundColor Green

Write-Host "=== 2. Compilando Frontend React com VITE_AWS_API_URL ===" -ForegroundColor Cyan
$env:VITE_AWS_API_URL = $ApiUrl
npm run build

if ($FrontendBucket -ne "") {
    Write-Host "=== 3. Publicando Frontend React no Amazon S3 (s3://$FrontendBucket) ===" -ForegroundColor Cyan
    aws s3 sync dist/ "s3://$FrontendBucket" --delete --region $Region
    Write-Host "Deploy concluido com sucesso!" -ForegroundColor Green
} else {
    Write-Host "Build gerado em ./dist pronto para AWS Amplify ou S3!" -ForegroundColor Yellow
}
