#!/bin/bash

PASTA="$(cd "$(dirname "$0")" && pwd)"
cd "$PASTA"

echo "================================================"
echo "  NGR BOT - CHATBOT WHATSAPP"
echo "================================================"
echo ""

# Verificar se ja esta em execucao
if lsof -ti:3000 >/dev/null 2>&1; then
    echo "[AVISO] Ja esta em execucao na porta 3000!"
    echo "Acesse: http://localhost:3000"
    echo ""
    read -p "Pressione Enter para continuar..."
    exit 0
fi

echo "Iniciando..."
echo ""

# Executar
node server.js
EXIT_CODE=$?

echo ""
echo "================================================"
echo "Servidor encerrado (codigo: $EXIT_CODE)"
echo "================================================"
echo ""
read -p "Pressione Enter para sair..."