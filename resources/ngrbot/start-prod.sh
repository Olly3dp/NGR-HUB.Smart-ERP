#!/bin/bash
# NGR Bot - Script de inicialização para produção
# Uso: ./start-prod.sh

echo "=============================================="
echo "  NGR BOT - Inicialização de Produção"
echo "=============================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Definir ambiente
export NODE_ENV=production
export PORT=3000

# Criar diretórios necessários
mkdir -p /var/log/pm2
mkdir -p public/uploads
chmod 755 public/uploads
chmod -R 755 public/assets/avatars

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "PM2 não encontrado. Instalando..."
    npm install -g pm2
fi

# Verificar/instalar dependências
echo "Verificando dependências..."
npm install --production

# Iniciar com PM2
echo "Iniciando NGR Bot..."
pm2 delete ngr-bot 2>/dev/null || true
pm2 start ecosystem.config.js

# Salvar configuração do PM2
pm2 save

# Configurar inicialização automática (executar como root)
echo ""
echo "Para configurar inicialização automática no boot:"
echo "  sudo env PATH=\$PATH:\$(which node) pm2 startup"
echo ""
echo "Comandos úteis:"
echo "  pm2 status        - Ver status"
echo "  pm2 logs ngr-bot  - Ver logs"
echo "  pm2 restart       - Reiniciar"
echo "  pm2 stop          - Parar"
echo ""
echo "=============================================="