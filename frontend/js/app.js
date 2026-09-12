import Nav from './modules/nav.js';
import LLM from './modules/llm.js';
import TTSUI from './modules/tts.js';
import './modules/actions.js';
import Dashboard from './modules/dashboard.js';
import Contas from './modules/contas.js';
import Vendas from './modules/vendas.js';
import Estoque from './modules/estoque.js';
import Clientes from './modules/clientes.js';
import Tarefas from './modules/tarefas.js';
import Calendario from './modules/calendario.js';
import Fichas from './modules/fichas.js';
import Documentos from './modules/documentos.js';
import Relatorios from './modules/relatorios.js';
import Perfil from './modules/perfil.js';
import WhatsApp from './modules/whatsapp.js';
import Planos from './modules/planos.js';

const pages = { dashboard: Dashboard, contas: Contas, vendas: Vendas, estoque: Estoque, clientes: Clientes, tarefas: Tarefas, calendario: Calendario, fichas: Fichas, documentos: Documentos, relatorios: Relatorios, perfil: Perfil, whatsapp: WhatsApp, planos: Planos };
let currentPage = null;
let currentPageName = '';

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}
window.showToast = showToast;

function showModal(html, label = 'Info') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal modal-lg"><div class="modal-header"><h3>${label}</h3><button class="modal-close">&times;</button></div><div class="modal-body">${html}</div></div>`;
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}
window.showModal = showModal;

async function navigate(pageName) {
    if (pageName === currentPageName && currentPage) return;
    const container = document.getElementById('page-content');
    const PageClass = pages[pageName];
    if (!PageClass) return;
    if (currentPage && currentPage.destroy) currentPage.destroy();
    currentPageName = pageName;
    container.innerHTML = '';
    currentPage = new PageClass(container);
    await currentPage.init();
    document.getElementById('page-title').textContent = document.querySelector(`.nav-item[data-page="${pageName}"]`)?.querySelector('span')?.textContent || pageName;
    document.querySelectorAll('.nav-item').forEach(e => e.classList.toggle('active', e.dataset.page === pageName));
}
window.navigate = navigate;

async function refreshCurrentPage() {
    if (currentPage && currentPage.load) await currentPage.load();
}
window.refreshCurrentPage = refreshCurrentPage;

function addGateStyles() {
    if (document.getElementById('gate-styles')) return;
    const st = document.createElement('style');
    st.id = 'gate-styles';
    st.textContent = `
        #gate-overlay{position:fixed;inset:0;z-index:9999;background:radial-gradient(circle at 50% 20%,#1a1230 0%,#0a0a0f 60%,#000 100%);display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0f0;overflow:hidden}
        #gate-overlay .gate-stars{position:absolute;inset:0;pointer-events:none}
        #gate-overlay .gate-star{position:absolute;background:#fff;border-radius:50%;opacity:.6;animation:gateTwinkle 3s infinite ease-in-out}
        @keyframes gateTwinkle{0%,100%{opacity:.2}50%{opacity:.9}}
        #gate-box{position:relative;text-align:center;padding:3.2rem 2.6rem;background:linear-gradient(160deg,rgba(30,30,50,.85),rgba(12,12,20,.92));border:1px solid rgba(212,160,23,.35);border-radius:24px;max-width:420px;width:92%;box-shadow:0 0 60px rgba(212,160,23,.15), inset 0 0 40px rgba(0,0,0,.4)}
        #gate-box .gate-rubi{font-size:3.2rem;color:#D4A017;text-shadow:0 0 18px rgba(212,160,23,.6);animation:gateFloat 4s ease-in-out infinite}
        @keyframes gateFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        #gate-box .gate-brand{font-size:2rem;font-weight:800;letter-spacing:2px;background:linear-gradient(90deg,#F5D76E,#D4A017,#c8102e);-webkit-background-clip:text;background-clip:text;color:transparent;margin:.4rem 0 .2rem}
        #gate-box .gate-tagline{color:#8888aa;font-size:.95rem;margin-bottom:1.5rem}
        #gate-box .gate-books{font-size:1.1rem;letter-spacing:2px;margin-bottom:.8rem}
        #gate-box .gate-features{display:flex;justify-content:center;gap:1.2rem;color:#666680;font-size:.7rem;margin-bottom:2rem}
        #gate-box .gate-features span{display:flex;align-items:center;gap:5px}
        #gate-box .gate-features i{color:#D4A017}
        #btn-iniciar{background:linear-gradient(135deg,#F5D76E,#D4A017);color:#000;border:none;cursor:pointer;font-size:1.05rem;font-weight:800;letter-spacing:1px;padding:1rem 2rem;width:100%;border-radius:14px;transition:all .25s;box-shadow:0 6px 24px rgba(212,160,23,.35)}
        #btn-iniciar:hover{transform:translateY(-3px);box-shadow:0 12px 34px rgba(212,160,23,.5)}
        #btn-iniciar:active{transform:translateY(0)}
        #gate-overlay .gate-hint{margin-top:1.2rem;color:#666680;font-size:.7rem}
        #gate-overlay .gate-hint i{color:#D4A017;margin:0 3px}
        #gate-overlay .gate-footer{position:fixed;bottom:14px;left:0;right:0;text-align:center;color:#55556a;font-size:.7rem}
    `;
    document.head.appendChild(st);
}

function passGate() {
    if (sessionStorage.getItem('erp_entered') === '1') return true;
    addGateStyles();
    let stars = '';
    for (let i = 0; i < 60; i++) {
        const size = (Math.random() * 2.5 + 1).toFixed(1);
        stars += `<div class="gate-star" style="width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-delay:${(Math.random()*3).toFixed(1)}s"></div>`;
    }
    const ov = document.createElement('div');
    ov.id = 'gate-overlay';
    ov.innerHTML = `
        <div class="gate-stars">${stars}</div>
        <div id="gate-box">
            <div class="gate-rubi"><i class="fas fa-gem"></i></div>
            <div class="gate-brand">NGR HUB</div>
            <div class="gate-books">📚💼📊</div>
            <div class="gate-tagline">Gestão Inteligente para o seu Negócio</div>
            <div class="gate-features">
                <span><i class="fas fa-check-circle"></i> Gestão</span>
                <span><i class="fas fa-check-circle"></i> Controle</span>
                <span><i class="fas fa-check-circle"></i> WhatsApp</span>
            </div>
            <button id="btn-iniciar" type="button"><i class="fas fa-play" style="margin-right:8px"></i> INICIAR</button>
            <div class="gate-hint"><i class="fas fa-shield-alt"></i> Acesso local e protegido <i class="fas fa-shield-alt"></i></div>
        </div>
        <div class="gate-footer">Desenvolvido por Alison B Oliver / NG Ruby</div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('#btn-iniciar').addEventListener('click', () => {
        sessionStorage.setItem('erp_entered', '1');
        ov.remove();
        init();
    }, { once: true });
    return false;
}

function addLicencaBlockStyles() {
    if (document.getElementById('licenca-block-styles')) return;
    const st = document.createElement('style');
    st.id = 'licenca-block-styles';
    st.textContent = `
        #licenca-block{position:fixed;inset:0;z-index:9000;background:radial-gradient(circle at 50% 25%,#221632 0%,#0a0a0f 60%,#000 100%);display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0f0;padding:1rem}
        #licenca-block .lic-box{text-align:center;background:linear-gradient(160deg,rgba(40,30,55,.9),rgba(12,12,20,.95));border:1px solid rgba(200,16,46,.4);border-radius:22px;padding:2.6rem 2.2rem;max-width:440px;width:100%;box-shadow:0 0 50px rgba(200,16,46,.18)}
        #licenca-block .lic-warn{font-size:3rem;color:#c8102e;margin-bottom:.4rem}
        #licenca-block h2{margin:.2rem 0;font-size:1.5rem}
        #licenca-block p{color:#a0a0bb;font-size:.9rem;line-height:1.5;margin:.5rem 0 1.4rem}
        #licenca-block .lic-btns{display:flex;flex-direction:column;gap:.6rem}
        #licenca-block .btn-block{width:100%;padding:.9rem;border-radius:12px;border:none;cursor:pointer;font-weight:700;font-size:.95rem}
        #licenca-block .btn-block.primary{background:linear-gradient(135deg,#F5D76E,#D4A017);color:#000}
        #licenca-block .btn-block.ghost{background:transparent;border:1px solid #55557a;color:#c8c8e0}
    `;
    document.head.appendChild(st);
}

function showLicencaBloqueada() {
    let ov = document.getElementById('licenca-block');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'licenca-block';
    ov.innerHTML = `
        <div class="lic-box">
            <div class="lic-warn"><i class="fas fa-lock"></i></div>
            <h2>Acesso limitado</h2>
            <p>Seu período de teste <strong>expirou</strong> e nenhuma recarga está ativa.
               Ative um plano para liberar o NGR HUB por mais 30 dias, ou desbloqueie com a conta Master.</p>
            <div class="lic-btns">
                <button class="btn-block primary" id="lic-ir-planos"><i class="fas fa-gem"></i> Ver planos e assinatura</button>
                <button class="btn-block ghost" id="lic-ir-conta"><i class="fas fa-user"></i> Ir para Minha Conta</button>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
    ov.querySelector('#lic-ir-planos').addEventListener('click', () => window.navigate('planos'));
    ov.querySelector('#lic-ir-conta').addEventListener('click', () => window.navigate('perfil'));
    // Deixa o usuário navegar para Planos/Perfil; esconde o bloqueio quando voltar a ter acesso
    const check = setInterval(async () => {
        const s = await window.ngr.licenca.status();
        if (s.acessoLivre) { clearInterval(check); document.getElementById('licenca-block')?.remove(); window.LIC_BLOQUEADO = false; }
    }, 2000);
}

async function init() {
    if (!window.ngr) {
        document.getElementById('page-content').innerHTML = '<div class="loading-screen"><p>Erro: IPC nao disponivel</p></div>';
        return;
    }

    if (!passGate()) return;

    const nav = new Nav();
    const llm = new LLM();
    window.llm = llm;
    const tts = new TTSUI();

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('closed');
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const icon = document.querySelector('#theme-toggle i');
        icon.className = document.body.classList.contains('light-theme') ? 'fas fa-sun' : 'fas fa-moon';
    });

    function toggleLLM(show) {
        const panel = document.getElementById('llm-panel');
        const fab = document.getElementById('llm-fab');
        const isHidden = panel.classList.toggle('hidden', show === false ? true : show === true ? false : undefined);
        fab.classList.toggle('hidden', !isHidden);
    }
    document.getElementById('llm-fab').addEventListener('click', () => toggleLLM(true));
    document.getElementById('llm-close').addEventListener('click', () => toggleLLM(false));

    const TODOS_BLOCOS = ['dashboard', 'contas', 'vendas', 'estoque', 'clientes', 'tarefas', 'calendario', 'fichas', 'documentos', 'relatorios', 'pizza', 'escadas'];
    const BLOCO_LABELS = { dashboard: 'Dashboard', contas: 'Contas', vendas: 'Vendas', estoque: 'Estoque', clientes: 'Clientes', tarefas: 'Tarefas', calendario: 'Calendario', fichas: 'Fichas Tecnicas', documentos: 'Documentos', relatorios: 'Relatorios', pizza: 'Grafico de Pizza', escadas: 'Grafico em Escadas' };
    window.TODOS_BLOCOS = TODOS_BLOCOS;
    window.BLOCO_LABELS = BLOCO_LABELS;

    async function carregarBlocosAtivos() {
        const raw = await window.ngr.config.get('dashboard_blocos');
        if (raw) try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p; } catch {}
        return [...TODOS_BLOCOS];
    }
    window.carregarBlocosAtivos = carregarBlocosAtivos;

    async function carregarTamanhos() {
        const raw = await window.ngr.config.get('dashboard_tamanhos');
        if (raw) try { return JSON.parse(raw); } catch {}
        return {};
    }

    async function carregarSidebarVisiveis() {
        const raw = await window.ngr.config.get('sidebar_blocos');
        if (raw) try { return JSON.parse(raw); } catch {}
        return TODOS_BLOCOS;
    }

    function aplicarSidebar(visiveis) {
        document.querySelectorAll('.sidebar-nav > .nav-item[data-page]').forEach(el => {
            const page = el.dataset.page;
            const sempreVisivel = page === 'perfil' || page === 'whatsapp' || page === 'planos';
            el.style.display = (sempreVisivel || visiveis.includes(page)) ? '' : 'none';
        });
    }

    document.getElementById('dashboard-config-btn').addEventListener('click', async () => {
        const panel = document.getElementById('dashboard-config-panel');
        panel.classList.toggle('hidden');
        if (panel.classList.contains('hidden')) return;

        const sidebarVisiveis = await carregarSidebarVisiveis();
        const ordem = await carregarBlocosAtivos();
        const tamanhos = await carregarTamanhos();
        const estiloAtual = (await window.ngr.config.get('dashboard_donut_estilo')) || '1';

        renderBlocosReorder(ordem, tamanhos);
        renderDonutEstilo(estiloAtual);

        atualizarCheckboxes('config-sidebar-lista', sidebarVisiveis, async (novos) => {
            await window.ngr.config.set('sidebar_blocos', JSON.stringify(novos));
            aplicarSidebar(novos);
        });
    });

    function renderDonutEstilo(estiloAtual) {
        const container = document.getElementById('config-donut-estilo');
        if (!container) return;
        const estilos = [
            { id: '1', icon: 'fa-chart-pie', label: 'Classico' },
            { id: '2', icon: 'fa-chart-bar', label: 'Vertical' },
            { id: '3', icon: 'fa-chart-simple', label: 'Medio' },
        ];
        container.innerHTML = estilos.map(e => `
            <button class="donut-estilo-btn ${e.id === estiloAtual ? 'active' : ''}" data-estilo="${e.id}">
                <i class="fas ${e.icon}"></i> ${e.label}
            </button>
        `).join('');
        container.querySelectorAll('.donut-estilo-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const estilo = btn.dataset.estilo;
                await window.ngr.config.set('dashboard_donut_estilo', estilo);
                container.querySelectorAll('.donut-estilo-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (currentPageName === 'dashboard' && currentPage && currentPage.load) await currentPage.load();
            });
        });
    }

    function renderBlocosReorder(ordem, tamanhos) {
        const container = document.getElementById('config-blocos-reorder');
        if (!container) return;
        tamanhos = tamanhos || {};

        async function salvar() {
            const visiveis = TODOS_BLOCOS.filter(b => ordem.includes(b));
            await window.ngr.config.set('dashboard_blocos', JSON.stringify(visiveis));
        }

        const itens = TODOS_BLOCOS.map((b) => {
            const ativo = ordem.includes(b);
            const tam = tamanhos[b] || 'large';
            return `
                <div class="config-reorder-item ${ativo ? '' : 'inativo'}" data-bloco="${b}">
                    <span class="bloco-name">${BLOCO_LABELS[b] || b}</span>
                    <span class="bloco-size" data-bloco="${b}" title="${tam === 'small' ? 'Expandir' : 'Comprimir'}">
                        <i class="fas ${tam === 'small' ? 'fa-compress' : 'fa-expand'}"></i>
                    </span>
                    <span class="bloco-eye" data-bloco="${b}" title="${ativo ? 'Ocultar' : 'Mostrar'}">
                        <i class="fas ${ativo ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    </span>
                </div>
            `;
        }).join('');
        container.innerHTML = itens;

        container.querySelectorAll('.bloco-eye').forEach(el => {
            el.addEventListener('click', async () => {
                const bloco = el.dataset.bloco;
                const idx = ordem.indexOf(bloco);
                if (idx >= 0) ordem.splice(idx, 1);
                else ordem.push(bloco);
                await salvar();
                renderBlocosReorder(ordem, tamanhos);
                if (currentPageName === 'dashboard' && currentPage && currentPage.load) await currentPage.load();
            });
        });

        container.querySelectorAll('.bloco-size').forEach(el => {
            el.addEventListener('click', async () => {
                const bloco = el.dataset.bloco;
                tamanhos[bloco] = tamanhos[bloco] === 'small' ? 'large' : 'small';
                await window.ngr.config.set('dashboard_tamanhos', JSON.stringify(tamanhos));
                renderBlocosReorder(ordem, tamanhos);
                if (currentPageName === 'dashboard' && currentPage && currentPage.load) await currentPage.load();
            });
        });
    }

    function atualizarCheckboxes(containerId, ativos, onChange) {
        const lista = document.getElementById(containerId);
        lista.innerHTML = TODOS_BLOCOS.map(b => `
            <label class="config-bloco-item">
                <input type="checkbox" data-bloco="${b}" ${ativos.includes(b) ? 'checked' : ''}>
                ${BLOCO_LABELS[b] || b}
            </label>
        `).join('');
        lista.querySelectorAll('input').forEach(el => el.addEventListener('change', async () => {
            const checks = [...lista.querySelectorAll('input:checked')].map(i => i.dataset.bloco);
            await onChange(checks);
        }));
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('#dashboard-config-btn') && !e.target.closest('#dashboard-config-panel')) {
            document.getElementById('dashboard-config-panel').classList.add('hidden');
        }
    });

    // Aplicar sidebar config ao navegar
    const _origNavigate = navigate;
    navigate = async function(pageName) {
        const visiveis = await carregarSidebarVisiveis();
        aplicarSidebar(visiveis);
        return _origNavigate(pageName);
    };
    window.navigate = navigate;

    // ---- Licença local (trial 10 dias, planos, conta master) ----
    try { window.licenca = await window.ngr.licenca.status(); } catch (e) { window.licenca = { acessoLivre: false, status: 'bloqueado' }; }
    const NAV_LIVRES_LICENCA = ['planos', 'perfil'];
    window.LIC_BLOQUEADO = !window.licenca.acessoLivre;
    if (window.LIC_BLOQUEADO) addLicencaBlockStyles();

    // Aviso de renovação: faltam 3 dias ou menos para expirar a recarga
    if (window.licenca.avisoRecarga && !window.LIC_BLOQUEADO) {
        const dias = window.licenca.avisoDias;
        const dataLimite = window.licenca.avisoDataLimite;
        const msg = dias === 1
            ? `Sua assinatura expira em 1 dia (${dataLimite}). Faça a recarga para não interromper o uso.`
            : `Faltam ${dias} dias para sua assinatura expirar (${dataLimite}). Programe a próxima recarga.`;
        setTimeout(() => window.showToast(msg, 'warning'), 1200);
    }

    function hideLicencaBlock() {
        const ov = document.getElementById('licenca-block');
        if (ov) ov.style.display = 'none';
    }
    window.hideLicencaBlock = hideLicencaBlock;

    const _navLicenca = navigate;
    navigate = async function(pageName) {
        if (window.LIC_BLOQUEADO) {
            if (NAV_LIVRES_LICENCA.includes(pageName)) {
                hideLicencaBlock();
            } else {
                showToast('Licença expirada — ative um plano para continuar', 'error');
                if (currentPageName !== 'planos') { hideLicencaBlock(); return _navLicenca('planos'); }
                return Promise.resolve();
            }
        }
        return _navLicenca(pageName);
    };
    window.navigate = navigate;

    if (window.LIC_BLOQUEADO) showLicencaBloqueada();

    // Sincronizacao cross-module: quando o banco muda, re-renderiza a pagina
    // visivel que depende da tabela alterada (ex.: entrada no estoque reflete
    // em Vendas/Dashboard; finalizar venda reflete em Estoque/Clientes).
    const syncTablePages = {
        produtos: ['estoque', 'vendas', 'dashboard', 'relatorios'],
        estoque_movimentos: ['estoque', 'vendas', 'dashboard', 'relatorios'],
        clientes: ['clientes', 'vendas', 'dashboard', 'relatorios'],
        vendas: ['vendas', 'clientes', 'dashboard', 'relatorios'],
        venda_itens: ['vendas', 'clientes', 'dashboard', 'relatorios'],
        contas: ['contas', 'dashboard', 'relatorios', 'calendario'],
        tarefas: ['tarefas', 'dashboard', 'calendario'],
        eventos: ['calendario', 'dashboard'],
        fichas: ['fichas'],
        documentos: ['documentos'],
        fornecedores: ['estoque', 'relatorios'],
        categorias: ['contas', 'estoque', 'relatorios'],
        precificacao_regras: ['relatorios', 'estoque'],
    };
    window.ngr.onDBChange((table) => {
        try {
            const pages = syncTablePages[table];
            if (!pages) return;
            if (!pages.includes(currentPageName)) return;
            if (currentPage && currentPage.load) currentPage.load();
        } catch (e) { /* refresh nao critico */ }
    });

    window.ngr.onDBReady(() => {
        navigate('dashboard');
    });

    window.ngr.initDB().then(r => {
        if (!r.success) showToast('Erro ao iniciar banco: ' + r.error, 'error');
    });

    window.ngr.onLLMError((msg) => {
        showToast('Erro IA: ' + msg, 'error');
    });
}

document.addEventListener('DOMContentLoaded', init);
