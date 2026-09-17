🚀 Main Pillars of NGRHUB Smart ERPWhatsApp Integrated via API: Set up your own API key and let an intelligent virtual assistant handle automated customer service, answering questions, qualifying leads, and streamlining support 24 hours a day. AI Management Assistant: Say goodbye to excessive clicks. Through text or voice commands to the internal AI, you can create tasks, register accounts payable, mark accounts as paid, and extract reports instantly. User-Friendly and Functional Interface: An ERP designed to be intuitive, ensuring that any team member can operate it without complex learning curves.

Markdown

# NGR HUB - Smart ERP & Agent IA

The **NGR HUB** is a comprehensive Management (CRM/ERP) solution and dynamic Minisite Builder, designed to simplify the administration of businesses, clients, sales, and digital presence on a single fast and intuitive platform.

Please provide the text you would like me to translate.

## 🚀 Technologies Used

* **Backend:** Python 3 (FastAPI / Flask / SQLite)
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Environment & Tools:** Shell Script (Bash), Node.js / Bun

Please provide the text you would like me to translate.

## 📋 Prerequisites

Before starting, make sure you have installed on your machine (Linux/Ubuntu/Debian):

* **Python 3.8+** and `pip`
* **Git**
* Package `psmisc` (for port management via `fuser`):
```bash ```
sudo apt update && sudo apt install psmisc -y

⚙️ Step-by-Step Installation and Execution
1. Clone the Repository

Open the terminal and download the project to your machine:
Bash

git clone [https://github.com/Olly3dp/NGR-HUB.Smart-ERP.git](https://github.com/Olly3dp/NGR-HUB.Smart-ERP.git)
cd NGR-HUB.Smart-ERP

2. Set Up the Virtual Environment (Optional, but Recommended)

Create and activate a Python virtual environment to isolate dependencies:
Bash

python3 -m venv .venv
fuente .venv/bin/activate

3. Install the Dependencies

Install all the necessary packages specified in the project:
Bash

pip install -r requirements.txt

(If the requirements.txt file does not exist, install the base packages such as pip install fastapi uvicorn sqlite3 or equivalents).
⚡ Quick Start (Automatic Script)

The repository includes an intelligent initialization script that frees up occupied ports and automatically starts the application.

Make the script executable:
Bash

chmod +x start.sh

Run the server:

Por Terminal:
Bash

./start.sh

Via Graphical Interface:
Double-click the start.sh file inside the project folder and select the "Run in Terminal" option.
