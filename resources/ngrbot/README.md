# NGR BOT - Micro-SaaS Multi-Tenant

## 🚀 Instalação na VPS (Amazon Lightsail)

### Requisitos
- VPS com 2GB RAM (mínimo)
- Ubuntu 20.04+ ou Debian 11+
- Node.js 18+
- NPM

---

### Passo 1: Conectar à VPS

```bash
ssh usuario@seu-ip-da-vps
```

---

### Passo 2: Instalar Node.js

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalação
node --version
npm --version
```

---

### Passo 3: Enviar arquivos para VPS

Você pode usar SCP ou Git:

**Opção A - SCP (do seu computador):**
```bash
scp -r ./NGR-BOT-SAAS usuario@seu-ip-da-vps:/home/usuario/
```

**Opção B - Git (na VPS):**
```bash
git clone seu-repositorio.git
cd NGR-BOT-SAAS
```

---

### Passo 4: Instalar dependências

```bash
cd /home/usuario/NGR-BOT-SAAS
npm install
```

---

### Passo 5: Configurar variáveis de ambiente (opcional)

```bash
# Criar arquivo .env
nano .env

# Adicionar:
MP_WEBHOOK_URL=https://seudominio.com/webhook/mercadopago
PORT=3000
```

---

### Passo 6: Iniciar o servidor

```bash
# Testar inicialização
npm start

# Se quiser rodar em background
nohup npm start > app.log 2>&1 &
```

---

### Passo 7: Configurar Nginx (Reverse Proxy)

```bash
# Instalar Nginx
sudo apt install nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/ngr-bot
```

Adicionar:

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar:

```bash
sudo ln -s /etc/nginx/sites-available/ngr-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### Passo 8: Configurar SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

---

### Configuração do Mercado Pago

1. Acesse: https://www.mercadopago.com.br/developers/pt panel
2. Vá em Credenciais > Suas credenciais
3. Copie o Access Token
4. Atualize no arquivo `src/services/mercadopago.js`
5. Configure a URL de webhook nas configurações do app no Mercado Pago:
   - URL: `https://seudominio.com/webhook/mercadopago`

---

### Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Iniciar servidor |
| `pm2 start server.js` | Rodar em background (PM2) |
| `pm2 logs` | Ver logs |
| `pm2 restart all` | Reiniciar |
| `pm2 stop all` | Parar |
| `pm2 delete all` | Remover |

---

### Estrutura de pastas

```
NGR-BOT-SAAS/
├── src/
│   ├── models/          # Sequelize (User, Subscription, BotConfig)
│   ├── routes/          # API Routes
│   ├── services/        # WhatsApp, MercadoPago
│   ├── middlewares/     # Auth
│   └── config/          # Database config
├── public/              # Arquivos estáticos
├── views/               # Frontend (Landing, Login, Dashboard)
├── sessions/            # Sessões WhatsApp (criado automaticamente)
├── database/            # SQLite (criado automaticamente)
├── server.js            # Entry point
└── package.json
```

---

### Limites recomendados

- **2GB RAM:** 5-10 clientes simultâneos
- **4GB RAM:** 15-25 clientes simultâneos
- **8GB RAM:** 50+ clientes simultâneos

---

### Troubleshooting

**QR Code não aparece:**
```bash
# Limpar sessões antigas
rm -rf sessions/*
```

**Memória cheia:**
```bash
# Verificar uso
free -h

# Limpar cache
sync && echo 3 > /proc/sys/vm/drop_caches
```

**Erro de porta:**
```bash
# Verificar o que está na porta 3000
lsof -i :3000

# Matar processo
kill -9 <PID>
```

---

## 📞 Suporte

- WhatsApp: +5511915082568
- Email: ngr.alboliver@outlook.com
- Site: www.ngruby.com.br

---

© 2024 NGRUBY - Soluções Tecnológicas
CNPJ: 60.573.956/0001-04