class Planos {
    constructor(container) { this.container = container; this.lic = null; }

    async init() {
        this.render();
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div>
                    <h3 class="page-section-title"><i class="fas fa-gem" style="color:var(--primary)"></i> Planos e Assinatura</h3>
                    <p class="text-muted" style="font-size:.85rem">Ative seu plano e gerencie a licença do NGR HUB (validade em dias corridos)</p>
                </div>
            </div>
            <div id="planos-licenca-status" class="card mb-2"></div>
            <div class="grid-3" id="planos-grid"></div>
            <div id="planos-master" class="card mb-2"></div>
        `;
    }

    async load() {
        this.lic = await window.ngr.licenca.status();
        this.renderLicenca();
        this.renderGrid();
        this.renderMaster();
    }

    renderLicenca() {
        const el = document.getElementById('planos-licenca-status');
        const l = this.lic;
        let info = '';

        if (l.master) {
            info = `<strong style="color:var(--primary)">CONTA MASTER</strong> — acesso total, sem restrições, válido indefinidamente.`;
        } else if (l.status === 'trial') {
            info = `<strong style="color:var(--orange)">Período de teste</strong> — <strong>${l.diasTrialRestantes}</strong> dia(s) restante(s). Após o término, ative um plano para continuar usando.`;
        } else if (l.status === 'ativo') {
            const nome = l.plano === 'smart' ? 'NGR Smart' : 'NGR Pro';
            info = `Plano <strong style="color:var(--primary)">${nome}</strong> ativo. <strong>${l.diasRestantes}</strong> dia(s) restantes. Renove antes do vencimento.`;
        } else {
            info = `<strong style="color:var(--red)">Acesso expirado</strong> — ative um plano abaixo para liberar o NGR HUB por mais 30 dias.`;
        }

        el.innerHTML = `
            <div class="card-header"><h3><i class="fas fa-id-card" style="color:var(--primary)"></i> Situação da Licença</h3></div>
            <p style="color:var(--text1)">${info}</p>
            <p class="text-muted" style="font-size:.8rem;margin-top:.3rem">Smart R$97/mês (ERP) · Pro R$147/mês (ERP + WhatsApp com IA)</p>
        `;
    }

    renderGrid() {
        const planos = [
            {
                id: 'smart', nome: 'NGR Smart', tagline: 'ERP completo',
                preco: 'R$ 97', precosufixo: '/mês', destaque: false, badge: '',
                features: [
                    { ok: true, txt: 'ERP completo (contas, produtos, vendas)' },
                    { ok: true, txt: 'Dashboard e relatórios' },
                    { ok: true, txt: 'Documentos e OCR' },
                    { ok: true, txt: 'Sem WhatsApp / sem IA' }
                ]
            },
            {
                id: 'pro', nome: 'NGR Pro', tagline: 'ERP + WhatsApp com IA',
                preco: 'R$ 147', precosufixo: '/mês', destaque: true, badge: 'MAIS POPULAR',
                features: [
                    { ok: true, txt: 'Tudo do Smart' },
                    { ok: true, txt: 'WhatsApp integrado' },
                    { ok: true, txt: 'Respostas inteligentes' },
                    { ok: true, txt: 'Agente Personalizado' }
                ]
            }
        ];

        document.getElementById('planos-grid').innerHTML = planos.map(p => `
            <div class="card ${p.destaque ? 'planos-destaque' : ''}" style="position:relative;border:${p.destaque ? '2px solid var(--primary)' : ''}">
                ${p.badge ? `<span class="planos-badge">${p.badge}</span>` : ''}
                <div style="text-align:center;margin-bottom:.8rem">
                    <div style="font-weight:700;color:var(--text1)">${p.nome}</div>
                    <div style="font-size:.75rem;color:var(--text2)">${p.tagline}</div>
                </div>
                <div style="text-align:center;margin-bottom:.8rem">
                    <span class="planos-preco" style="font-size:1.6rem;font-weight:800;color:var(--primary)">${p.preco}</span>
                    <span style="font-size:.7rem;color:var(--text2)">${p.precosufixo}</span>
                </div>
                <div style="font-size:.8rem;color:var(--text1);margin-bottom:1rem">
                    ${p.features.map(f => `
                        <div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">
                            <span style="color:${f.ok ? 'var(--green)' : 'var(--red)'}">${f.ok ? '✓' : '✗'}</span>
                            <span style="${f.ok ? '' : 'color:var(--text2)'}">${f.txt}</span>
                        </div>`).join('')}
                </div>
                <button class="btn btn-primary" style="width:100%;color:#191714" data-plano="${p.id}">Ativar ${p.nome}</button>
            </div>
        `).join('');

        this.container.querySelectorAll('button[data-plano]').forEach(btn => {
            btn.addEventListener('click', () => this.abrirPix(btn.dataset.plano));
        });
    }

    renderMaster() {
        const el = document.getElementById('planos-master');
        el.innerHTML = `
            <div class="card-header"><h3><i class="fas fa-crown" style="color:var(--primary)"></i> Desbloqueio <span class="text-muted">(Conta Master)</span></h3></div>
            <p class="text-muted" style="font-size:.8rem;margin:.3rem 0 .8rem">Se você é o responsável (admin) do NGR, desbloqueie o acesso total entrando com as credenciais originais.</p>
            <div class="grid-2">
                <input id="master-email" class="form-control" type="email" placeholder="E-mail da conta master">
                <input id="master-senha" class="form-control" type="password" placeholder="Senha da conta master">
            </div>
            <button id="master-btn" class="btn btn-primary mt-2">Desbloquear acesso total</button>
        `;
        el.querySelector('#master-btn').addEventListener('click', async () => {
            const email = el.querySelector('#master-email').value.trim();
            const senha = el.querySelector('#master-senha').value;
            if (!email || !senha) { window.showToast('Informe e-mail e senha', 'error'); return; }
            const r = await window.ngr.licenca.master(email, senha);
            if (r.success && r.master) {
                window.showToast('Acesso Master liberado', 'success');
                this.load();
            } else {
                window.showToast('Credenciais inválidas', 'error');
            }
        });
    }

    async abrirPix(plano) {
        const nome = plano === 'smart' ? 'NGR Smart' : 'NGR Pro';
        const preco = plano === 'smart' ? 'R$ 97' : 'R$ 147';
        const email = localStorage.getItem('ngr_user_email') || '';

        const frag = document.createElement('div');
        frag.innerHTML = `
            <div style="text-align:center;margin-bottom:1rem">
                <div style="font-weight:700;color:var(--primary);font-size:1.1rem">${nome} — ${preco}/mês</div>
                <div style="font-size:.85rem;color:var(--text2);margin-top:.2rem">Pagamento via PIX · libera <strong>30 dias corridos</strong></div>
            </div>
            <div style="display:flex;gap:.5rem;margin-bottom:.8rem">
                <input id="pix-copia" class="form-control" readonly value="00020126580014BR.GOV.BCB.PIX0136ngr.alboliver@gmail.com5204000053039865802BR5911NGR AGENT6007SAO PAULO6304ABCD">
                <button id="pix-copiar" class="btn btn-ghost">Copiar</button>
            </div>
            <div style="font-size:.8rem;color:var(--text1);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:.7rem;margin-bottom:.8rem">
                Pague o <strong>${preco}</strong> via PIX copia-e-cola acima. O sistema verifica automaticamente o recebimento antes de liberar o acesso.
            </div>
            <button id="pix-confirmar" class="btn btn-primary" style="width:100%">Verificar pagamento e ativar</button>
            <div id="pix-status" style="text-align:center;font-size:.8rem;color:var(--text2);margin-top:.5rem"></div>
        `;

        this.pixModal = window.showModal(frag.innerHTML, `Pagamento PIX — ${nome}`);
        setTimeout(() => {
            const copy = document.getElementById('pix-copiar');
            if (copy) copy.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(copy.value); window.showToast('PIX copiado', 'success'); }
                catch (e) { copy.select(); document.execCommand('copy'); }
            });
            const conf = document.getElementById('pix-confirmar');
            if (conf) conf.addEventListener('click', async () => {
                conf.disabled = true;
                conf.textContent = 'Verificando pagamento...';
                const statusEl = document.getElementById('pix-status');

                try {
                    const r = await window.ngr.licenca.verifyAndActivate(plano, email);
                    if (r && r.success) {
                        const dias = r.diasRestantes || 30;
                        window.showToast(`${nome} ativado por ${dias} dias — pagamento verificado`, 'success');
                        this.closePixModal();
                        this.load();
                    } else {
                        const msg = r?.error || 'Pagamento não confirmado';
                        if (statusEl) statusEl.textContent = msg;
                        window.showToast('Pagamento ainda não confirmado. Verifique se o PIX foi enviado e tente novamente.', 'error');
                        conf.disabled = false;
                        conf.textContent = 'Verificar pagamento e ativar';
                    }
                } catch (e) {
                    if (statusEl) statusEl.textContent = 'Erro ao verificar: ' + e.message;
                    window.showToast('Erro ao verificar pagamento', 'error');
                    conf.disabled = false;
                    conf.textContent = 'Verificar pagamento e ativar';
                }
            });
        }, 30);
    }

    closePixModal() {
        const overlays = document.querySelectorAll('.modal-overlay');
        const last = overlays[overlays.length - 1];
        if (last) last.remove();
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Planos;
