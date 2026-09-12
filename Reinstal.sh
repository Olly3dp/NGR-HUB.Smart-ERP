#!/bin/bash
GOLD='\033[0;33m'; WHITE='\033[1;37m'; NC='\033[0m'
echo -e "${GOLD}=========================================================${NC}"
echo -e "${WHITE}       NGR HUB - ATUALIZANDO                           ${NC}"
echo -e "${GOLD}=========================================================${NC}"
cd "/home/olly3dp/Documentos/NGR Agent" || { echo -e "${WHITE}[ERRO] Pasta nao encontrada.${NC}"; exit 1; }
echo -e "\n${WHITE}[1/3] Instalando dependencias...${NC}"
# Compatibilidade de CPU (maquinas antigas): build universal sem AVX/AVX2/FMA
export CMAKE_ARGS="-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_FMA=OFF -DGGML_NATIVE=OFF"
export GGML_NATIVE=0
export LLAMA_AVX=OFF
export LLAMA_AVX2=OFF
export LLAMA_FMA=OFF
npm install
echo -e "\n${WHITE}[2/3] Verificando modelo...${NC}"
if [ ! -f "models/Qwen2.5-1.5B-Instruct-uncensored-Q4_K_M.gguf" ]; then
    echo -e "${WHITE}[AVISO] Modelo GGUF nao encontrado em models/${NC}"
fi
echo -e "\n${WHITE}[3/3] Pronto!${NC}"
echo -e "${GOLD}=========================================================${NC}"
echo -e "${WHITE}   Execute: npm start                                     ${NC}"
echo -e "${GOLD}=========================================================${NC}"
