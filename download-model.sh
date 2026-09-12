#!/bin/bash

# NG Ruby - Download do Modelo GGUF
# Baixa o modelo Qwen2.5-1.5B-Instruct-uncensored para uso local

GOLD='\033[0;33m'
WHITE='\033[1;37m'
NC='\033[0m'

MODEL_DIR="/home/olly3dp/Documentos/NGR Agent/models"
MODEL_FILE="$MODEL_DIR/Qwen2.5-1.5B-Instruct-uncensored-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/mradermacher/Qwen2.5-1.5B-Instruct-uncensored-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-uncensored.Q4_K_M.gguf"

mkdir -p "$MODEL_DIR"

echo -e "${GOLD}=========================================================${NC}"
echo -e "${WHITE}       NG RUBY - DOWNLOAD DO MODELO                    ${NC}"
echo -e "${GOLD}=========================================================${NC}"

if [ -f "$MODEL_FILE" ]; then
    echo -e "\n${GOLD}Modelo já existe: $(ls -lh "$MODEL_FILE" | awk '{print $5}')${NC}"
    echo -e "Deseja baixar novamente? (s/N)"
    read -r resp
    if [ "$resp" != "s" ] && [ "$resp" != "S" ]; then
        echo -e "Download cancelado."
        exit 0
    fi
fi

echo -e "\n${WHITE}Baixando modelo (~1.1GB) de:${NC}"
echo -e "$MODEL_URL"
echo -e "\n${GOLD}Isso pode levar alguns minutos...${NC}"

if command -v wget &> /dev/null; then
    wget -O "$MODEL_FILE" "$MODEL_URL" --progress=bar:force
elif command -v curl &> /dev/null; then
    curl -L -o "$MODEL_FILE" "$MODEL_URL" --progress-bar
else
    echo -e "${WHITE}[ERRO] wget ou curl não encontrados. Instale um deles.${NC}"
    exit 1
fi

if [ -f "$MODEL_FILE" ]; then
    echo -e "\n${GOLD}Download concluído!${NC}"
    echo -e "Arquivo: $MODEL_FILE"
    echo -e "Tamanho: $(ls -lh "$MODEL_FILE" | awk '{print $5}')"
else
    echo -e "\n${WHITE}[ERRO] Download falhou.${NC}"
    exit 1
fi
