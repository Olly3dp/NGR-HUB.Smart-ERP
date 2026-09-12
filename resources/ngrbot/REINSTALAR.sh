#!/bin/bash

echo "================================================"
echo "  NGR BOT - REINSTALAR"
echo "================================================"
echo ""

PASTA="$(cd "$(dirname "$0")" && pwd)"
cd "$PASTA"

echo "Isso ira remover:"
echo "  - node_modules (dependencias)"
echo "  - .wwebjs_auth (sessao WhatsApp)"
echo "  - .wwebjs_cache (cache)"
echo "  - package-lock.json (lock antigo - evita dependencias vulneraveis)"
echo "  - Servidor na porta 3000"
echo ""
read -p "Digite YES para confirmar: " CONFIRM

if [ "$CONFIRM" != "YES" ]; then
    echo "Cancelado."
    exit 1
fi

echo ""
echo "Encerrando servidor..."

# Encerrar processo na porta 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo "Removendo arquivos..."

rm -rf node_modules .wwebjs_auth .wwebjs_cache nul 2>/dev/null
rm -f package-lock.json 2>/dev/null

echo "Arquivos removidos!"
echo ""
echo "Instalando nova versao..."
echo "(Pode demorar 1-2 minutos)"
echo ""

# Instalar dependencias
npm install

if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao instalar. Verifique sua conexao."
    exit 1
fi

echo ""
echo "================================================"
echo "  Instalacao concluida!"
echo "================================================"
echo ""
echo "Para iniciar, execute: ./INICIAR.sh"
echo "Ou: node server.js"
echo "Acesse: http://localhost:3000"
echo ""
read -p "Pressione Enter para continuar..."