🚀 Pilares Principais do NGRHUB Smart ERPWhatsApp Integrado via API: Configure sua própria chave de API e deixe que um assistente virtual inteligente faça o atendimento automatizado aos seus clientes, respondendo dúvidas, qualificando leads e agilizando o suporte 24 horas por dia.Assistente de Gestão por IA: Diga adeus aos cliques excessivos. Através de comandos de texto ou voz para a IA interna, você pode criar tarefas, cadastrar contas a pagar, marcar contas como pagas e extrair relatórios instantaneamente.  Interface Amigável e Funcional: Um ERP desenhado para ser intuitivo, garantindo que qualquer membro da equipe consiga operá-lo sem curvas de aprendizado complexas.

Markdown

# NGR HUB - Smart ERP & Criador de Minisites

O **NGR HUB** é uma solução completa de Gestão (CRM/ERP) e Construtor de Minisites dinâmicos, desenvolvida para simplificar a administração de negócios, clientes, vendas e presença digital em uma única plataforma rápida e intuitiva.

---

## 🚀 Tecnologias Utilizadas

* **Backend:** Python 3 (FastAPI / Flask / SQLite)
* **Frontend:** HTML5, CSS3, JavaScript Vanilla
* **Ambiente & Ferramentas:** Shell Script (Bash), Node.js / Bun

---

## 📋 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado em sua máquina (Linux/Ubuntu/Debian):

* **Python 3.8+** e `pip`
* **Git**
* Pacote `psmisc` (para gerenciamento de portas via `fuser`):
  ```bash
  sudo apt update && sudo apt install psmisc -y

⚙️ Passo a Passo de Instalação e Execução
1. Clonar o Repositório

Abra o terminal e baixe o projeto para a sua máquina:
Bash

git clone [https://github.com/Olly3dp/NGR-HUB.Smart-ERP.git](https://github.com/Olly3dp/NGR-HUB.Smart-ERP.git)
cd NGR-HUB.Smart-ERP

2. Configurar o Ambiente Virtual (Opcional, mas Recomendado)

Crie e ative um ambiente virtual Python para isolar as dependências:
Bash

python3 -m venv .venv
source .venv/bin/activate

3. Instalar as Dependências

Instale todos os pacotes necessários especificados no projeto:
Bash

pip install -r requirements.txt

(Caso o arquivo requirements.txt não exista, instale os pacotes base como pip install fastapi uvicorn sqlite3 ou equivalentes).
⚡ Inicialização Rápida (Script Automático)

O repositório conta com um script de inicialização inteligente que libera portas ocupadas e sobe a aplicação automaticamente.

    Torne o script executável:
    Bash

    chmod +x start.sh

    Execute o servidor:

        Via Terminal:
        Bash

        ./start.sh

        Via Interface Gráfica:
        Dê dois cliques no arquivo start.sh dentro da pasta do projeto e selecione a opção "Executar no Terminal".
