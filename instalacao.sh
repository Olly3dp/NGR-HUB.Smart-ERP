#!/bin/bash

# NGR HUB (ERP) + NGR BOT (módulo WhatsApp)
# Inicialização única: instala dependências, sobe o NGR BOT em segundo plano
# e abre o ERP já integrado, com um único clique.

GOLD='\033[0;33m'
WHITE='\033[1;37m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GOLD}"
echo ""
echo "  ▓   ▓  ▓▓▓  ▓▓▓▓     ▓   ▓ ▓   ▓ ▓▓▓▓          "
echo "  ▓▓  ▓░▓ ░░░ ▓░░░▓    ▓░  ▓░▓░  ▓░▓░░░▓         "
echo "  ▓░▓ ▓░▓░ ▓▓░▓▓▓▓░░   ▓▓▓▓▓░▓░░ ▓░▓▓▓▓░░        "
echo "  ▓░░▓▓░▓░░ ▓░▓░░▓░ ░  ▓░░░▓░▓░░ ▓░▓░░░▓ ░       "
echo "  ▓░░ ▓░░▓▓▓ ░▓░░░▓░   ▓░░░▓░░▓▓▓ ░▓▓▓▓░░        "
echo "   ░░  ░░ ░░░ ░░░  ░    ░░  ░░ ░░░ ░░░░░ ░       "
echo "    ░   ░  ░░░  ░   ░    ░   ░  ░░░  ░░░░         "
echo ""
echo -e "${WHITE}  NGR HUB + NGR BOT - INICIANDO${NC}"
echo -e "${GOLD}=========================================================${NC}"

# Resolve o diretório do próprio script (funciona de qualquer lugar)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || {
    echo -e "${RED}[ERRO] Nao foi possivel acessar a pasta do projeto.${NC}"
    read -p "Pressione Enter para sair..."
    exit 1
}

echo -e "${GREEN}Diretorio do projeto: $SCRIPT_DIR${NC}"

# ==================================================================
# COMPATIBILIDADE DE CPU (máquinas antigas/modestas)
# Força build universal (sem AVX/AVX2/FMA) e desativa aceleração nativa,
# evitando o erro "Illegal instruction" (SIGILL) em CPUs sem suporte.
# ==================================================================
export CMAKE_ARGS="-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_FMA=OFF -DGGML_NATIVE=OFF"
export GGML_NATIVE=0
export LLAMA_AVX=OFF
export LLAMA_AVX2=OFF
export LLAMA_FMA=OFF
echo -e "${GREEN}[OK] Flags de CPU universal aplicadas (sem AVX/AVX2/FMA).${NC}"

# ==================================================================
# INSTALAÇÃO DE DEPENDÊNCIAS (resiliente / não-bloqueante)
# O @node-llama-cpp (v3.19+) declara binários opcionais para VÁRIAS
# arquiteturas (ex.: linux-riscv64). Em npm antigos (9.x / Node 18)
# isso faz o "npm install" tentar baixar TODOS esses binários e pode
# demorar/travar na rede. Por isso, se as dependências já estiverem
# instaladas e funcionando, pulamos a reinstalação. E, se a instalação
# falhar, apenas avisamos — o sistema abre mesmo assim.
# ==================================================================
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}[ERRO] Node.js nao encontrado. Instale em https://nodejs.org${NC}"
    read -p "Pressione Enter para sair..."
    exit 1
fi
echo -e "${GREEN}[OK] Node.js $(node -v) detectado.${NC}"

need_install=0
if [ ! -d "node_modules" ]; then
    need_install=1
fi

if [ "$need_install" = "1" ]; then
    echo -e "\n${WHITE}[1/5] Instalando dependencias do Node.js (ERP)...${NC}"
    # - ignore scripts: nao roda o postinstall do node-llama-cpp (baixa binario
    #   LLM da rede e trava); o binario real e tratado na etapa 3.
    # - se a instalacao falhar, segue mesmo assim (pode ja existir instalacao).
    npm install --ignore-scripts 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}[AVISO] Falha na instalacao das dependencias do ERP.${NC}"
        echo -e "${RED}        O sistema tentara abrir com as dependencias ja existentes.${NC}"
    fi
else
    echo -e "\n${WHITE}[1/5] Dependencias do ERP ja instaladas (node_modules presente).${NC}"
fi

echo -e "\n${WHITE}[2/5] Instalando dependencias do NGR BOT (WhatsApp)...${NC}"
if [ -d "$SCRIPT_DIR/resources/ngrbot" ]; then
    if [ ! -d "$SCRIPT_DIR/resources/ngrbot/node_modules" ]; then
        (cd "$SCRIPT_DIR/resources/ngrbot" && npm install --ignore-scripts 2>&1)
        if [ $? -ne 0 ]; then
            echo -e "${RED}[AVISO] Falha ao instalar dependencias do NGR BOT.${NC}"
            echo -e "${RED}        Prosseguindo mesmo assim; o WhatsApp podera nao funcionar.${NC}"
        fi
    else
        echo -e "${WHITE}[2/5] Dependencias do NGR BOT ja instaladas.${NC}"
    fi
else
    echo -e "${RED}[ERRO] Pasta resources/ngrbot nao encontrada. Integracao ausente.${NC}"
    read -p "Pressione Enter para sair..."
    exit 1
fi

echo -e "\n${WHITE}[3/5] Verificando modelo GGUF (IA)...${NC}"
MODEL_FILE="models/Qwen2.5-1.5B-Instruct-uncensored-Q4_K_M.gguf"
if [ ! -f "$MODEL_FILE" ]; then
    echo -e "${WHITE}[AVISO] Modelo nao encontrado. Deseja baixar agora? (s/N)${NC}"
    read -r resp
    if [ "$resp" = "s" ] || [ "$resp" = "S" ]; then
        echo -e "Baixando modelo (~1.1GB)..."
        ./download-model.sh
    else
        echo -e "Baixe manualmente e coloque em: $MODEL_FILE"
    fi
else
    echo -e "${GOLD}Modelo encontrado: $(ls -lh "$MODEL_FILE" | awk '{print $5}')${NC}"
fi

echo -e "\n${WHITE}[4/5] Verificando servidor NGR BOT (porta 3000)...${NC}"
if curl -s --max-time 3 -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo -e "${GREEN}[OK] NGR BOT ja esta ativo em http://localhost:3000${NC}"
else
    echo -e "${WHITE}[INFO] O NGR BOT sera iniciado automaticamente junto com o ERP (pelo main.js).${NC}"
fi

echo -e "\n${WHITE}[5/5] Iniciando NGR HUB + NGR BOT...${NC}"
echo -e "${GOLD}=========================================================${NC}"
echo -e "${WHITE}   O modulo WhatsApp sera habilitado no menu lateral.     ${NC}"
echo -e "${WHITE}   Pressione Ctrl+C para encerrar.                       ${NC}"
echo -e "${GOLD}=========================================================${NC}"

# O main.js do Electron sobe o NGR BOT em segundo plano automaticamente
npx electron .

# Ao fechar o Electron, encerra o processo do NGR BOT que ele iniciou
echo -e "\n${WHITE}Encerrando NGR HUB...${NC}"
