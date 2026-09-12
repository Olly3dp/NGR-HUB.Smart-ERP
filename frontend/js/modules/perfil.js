class Perfil {
    constructor(container) { this.container = container; }

    async init() {
        this.render();
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="perfil-page">
                <div class="grid-2">
                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-user-circle" style="color:var(--primary)"></i> Meu Perfil</h3></div>
                        <div class="perfil-avatar-area">
                            <div class="perfil-avatar" id="perfil-avatar-click" style="cursor:pointer;overflow:hidden">
                                <img id="perfil-avatar-img" style="width:100%;height:100%;object-fit:cover;display:none">
                                <i id="perfil-avatar-icon" class="fas fa-user fa-3x"></i>
                            </div>
                            <input type="file" id="perfil-foto-input" accept="image/*" style="display:none">
                            <div style="font-size:.75rem;color:var(--text2);margin-top:4px">Clique na foto para alterar (max 5MB)</div>
                        </div>
                        <div class="form-group"><label>Nome</label><input class="form-control" id="perfil-nome" placeholder="Seu nome"></div>
                        <div class="form-group"><label>Sobre mim</label><textarea class="form-control" id="perfil-sobre" rows="4" placeholder="Conte um pouco sobre voce, seu negocio, suas areas de atuacao..."></textarea></div>
                        <div class="form-group"><label>Meu Negocio</label><input class="form-control" id="perfil-negocio" placeholder="Ex: Loja de roupas, Oficina, Consultoria"></div>
                        <div class="modal-actions">
                            <button class="btn btn-primary" id="perfil-save"><i class="fas fa-save"></i> Salvar Perfil</button>
                        </div>
                        <div id="perfil-status" class="text-muted mt-1" style="font-size:0.85rem"></div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h3><i class="fas fa-robot" style="color:var(--primary)"></i> Assistente WhatsApp</h3></div>
                        <p style="font-size:.8rem;color:var(--text2);margin-bottom:.6rem">Configuracoes do bot que atende pelo WhatsApp (integrado ao NGR HUB). Salvam automaticamente no modulo.</p>

                        <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                            <label style="margin:0">IA Ativa</label>
                            <label class="switch"><input type="checkbox" id="wa-ia-ativa"><span class="slider"></span></label>
                        </div>
                        <div class="form-group"><label>Chave API Groq</label><input class="form-control" id="wa-groq-key" type="password" placeholder="gsk_..." autocomplete="off"></div>
                        <div class="form-group"><label>Modelo de IA</label>
                            <select class="form-control" id="wa-modelo">
                                <option value="groq/compound-mini">⚡ Velocidade (Compound Mini)</option>
                                <option value="groq/compound">🧠 Qualidade (Compound)</option>
                                <option value="qwen/qwen3.6-27b">🌐 Qwen 3.6 27B</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Prompt (Personalidade)</label><textarea class="form-control" id="wa-prompt" rows="3" placeholder="Voce e um assistente da NG Ruby..."></textarea></div>
                        <div style="text-align:right;margin-bottom:.6rem"><a href="https://console.groq.com/" target="_blank" rel="noopener" style="font-size:.75rem;color:var(--primary)">Obter Chave API no Groq <i class="fas fa-external-link-alt"></i></a></div>

                        <div class="form-group">
                            <label>Fluxos Automaticos (palavra-chave → resposta)</label>
                            <div id="wa-fluxos"></div>
                            <button type="button" class="btn btn-ghost" id="wa-add-fluxo" style="margin-top:.4rem;font-size:.78rem"><i class="fas fa-plus"></i> Adicionar Fluxo</button>
                        </div>

                        <div class="modal-actions">
                            <button class="btn btn-primary" id="wa-save"><i class="fas fa-save"></i> Salvar Config WhatsApp</button>
                        </div>
                        <div id="wa-status" class="text-muted mt-1" style="font-size:0.85rem"></div>
                    </div>
                </div>

                <div class="card mb-2" style="margin-top:16px">
                    <div class="card-header"><h3><i class="fas fa-id-card" style="color:var(--primary)"></i> Minha Conta Local</h3></div>
                    <div id="perfil-licenca" style="font-size:.9rem;color:var(--text1)">Carregando...</div>
                    <hr style="border-color:var(--border);margin:12px 0">
                    <div class="form-group"><label>Chave API Groq (sua, usada no plano Pro)</label>
                        <div style="display:flex;gap:.4rem">
                            <input class="form-control" id="perfil-groq-key" type="password" placeholder="gsk_..." autocomplete="off" style="flex:1">
                            <button class="btn btn-primary" id="perfil-groq-save"><i class="fas fa-save"></i> Salvar</button>
                        </div>
                    </div>
                    <hr style="border-color:var(--border);margin:12px 0">
                    <div class="card-header"><h3><i class="fas fa-crown" style="color:var(--primary)"></i> Desbloqueio Master</h3></div>
                    <p style="font-size:.8rem;color:var(--text2);margin:.3rem 0 .8rem">Responsável (admin) do NGR? Entre com as credenciais originais para acesso total e indefinido.</p>
                    <div class="grid-2">
                        <input class="form-control" id="perfil-master-email" type="email" placeholder="E-mail da conta master">
                        <input class="form-control" id="perfil-master-senha" type="password" placeholder="Senha da conta master">
                    </div>
                    <div class="modal-actions" style="margin-top:12px">
                        <button class="btn btn-ghost" id="perfil-master-btn"><i class="fas fa-unlock"></i> Desbloquear acesso total</button>
                    </div>
                    <div id="perfil-licenca-status" class="text-muted mt-1" style="font-size:0.85rem"></div>
                </div>

                <div class="card mb-2" style="margin-top:16px">
                    <div class="card-header"><h3><i class="fas fa-info-circle" style="color:var(--primary)"></i> Sobre o Sistema</h3></div>
                    <div class="about-section">
                        <p><strong>NGR HUB</strong> — Sistema de gestao inteligente para pequenos negocios.</p>
                        <p>Desenvolvido por <strong>Alison B Oliver / NG Ruby</strong></p>
                        <hr style="border-color:var(--border);margin:12px 0">
                        <p><i class="fas fa-microchip" style="color:var(--primary);width:20px"></i> Modelo: Colio IA (Qwen Integrado)</p>
                        <p><i class="fas fa-database" style="color:var(--primary);width:20px"></i> Banco: SQLite 100% local</p>
                        <p><i class="fas fa-globe" style="color:var(--primary);width:20px"></i> Offline — sem internet necessaria</p>
                        <p><i class="fas fa-shield-alt" style="color:var(--primary);width:20px"></i> Seus dados permanecem na sua maquina</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('perfil-save').addEventListener('click', () => this.savePerfil());
        document.getElementById('perfil-avatar-click').addEventListener('click', () => document.getElementById('perfil-foto-input').click());
        document.getElementById('perfil-foto-input').addEventListener('change', (e) => this.handleFoto(e));
        document.getElementById('wa-save').addEventListener('click', () => this.saveWhatsApp());
        document.getElementById('wa-add-fluxo').addEventListener('click', () => this.addFluxo());
        document.getElementById('perfil-groq-save').addEventListener('click', () => this.saveGroqKey());
        document.getElementById('perfil-master-btn').addEventListener('click', () => this.desbloquearMaster());
    }

    async loadLicenca(prefillGroq = '') {
        const el = document.getElementById('perfil-licenca');
        const st = document.getElementById('perfil-licenca-status');
        try { var lic = await window.ngr.licenca.status(); } catch (e) { lic = { status: 'trial', acessoLivre: true };}
        if (el) {
            let txt = '';
            if (lic.master) {
                txt = `<p><strong style="color:var(--primary)"><i class="fas fa-crown"></i> Conta Master</strong> — acesso total, válido indefinidamente.</p>`;
            } else if (lic.status === 'trial') {
                txt = `<p><strong style="color:var(--orange)">Período de teste</strong> — <strong>${lic.diasTrialRestantes}</strong> dia(s) restante(s) desde a 1ª instalação.</p>`;
            } else if (lic.status === 'ativo') {
                const nome = lic.plano === 'smart' ? 'NGR Smart' : 'NGR Pro';
                txt = `<p>Plano <strong style="color:var(--primary)">${nome}</strong> ativo · <strong>${lic.diasRestantes}</strong> dia(s) restante(s).</p>`;
            } else {
                txt = `<p style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> Acesso expirado — ative um plano em <strong>Planos e Assinatura</strong>.</p>`;
            }
            el.innerHTML = txt;
        }
        const gk = document.getElementById('perfil-groq-key');
        if (gk) gk.value = prefillGroq || '';
        if (st) st.textContent = '';
    }

    async saveGroqKey() {
        const chave = document.getElementById('perfil-groq-key').value.trim();
        const st = document.getElementById('perfil-licenca-status');
        if (!chave) { if (st) st.textContent = ''; return; }
        await window.ngr.licenca.groq(chave);
        await window.ngr.config.set('wa_groq_key', chave);
        if (st) st.innerHTML = '<span style="color:var(--green)">Chave API Groq salva.</span>';
    }

    async desbloquearMaster() {
        const email = document.getElementById('perfil-master-email').value.trim();
        const senha = document.getElementById('perfil-master-senha').value;
        const st = document.getElementById('perfil-licenca-status');
        if (!email || !senha) { if (st) st.innerHTML = '<span style="color:var(--red)">Informe e-mail e senha.</span>'; return; }
        const r = await window.ngr.licenca.master(email, senha);
        if (r && r.success && r.master) {
            if (st) st.innerHTML = '<span style="color:var(--green)">Acesso Master liberado. Recarregue a página se necessário.</span>';
            window.showToast('Acesso Master liberado', 'success');
            window.LIC_BLOQUEADO = false;
            this.loadLicenca();
        } else {
            if (st) st.innerHTML = '<span style="color:var(--red)">Credenciais inválidas.</span>';
        }
    }

    switchCSS() {
        if (document.getElementById('switch-css')) return;
        const st = document.createElement('style');
        st.id = 'switch-css';
        st.textContent = `.switch{position:relative;display:inline-block;width:44px;height:24px}
          .switch input{opacity:0;width:0;height:0}
          .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg3);transition:.3s;border-radius:24px}
          .slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:.3s;border-radius:50%}
          .switch input:checked + .slider{background:var(--green)}
          .switch input:checked + .slider:before{transform:translateX(20px)}`;
        document.head.appendChild(st);
    }

    addFluxo(keyword = '', response = '') {
        const box = document.getElementById('wa-fluxos');
        const div = document.createElement('div');
        div.className = 'wa-fluxo-item';
        div.style.cssText = 'display:flex;gap:.4rem;margin-bottom:.4rem';
        div.innerHTML = `
            <input class="form-control wa-fluxo-key" placeholder="Palavra-chave" value="${this.esc(keyword)}" style="flex:0 0 34%;font-size:.8rem">
            <input class="form-control wa-fluxo-resp" placeholder="Resposta" value="${this.esc(response)}" style="flex:1;font-size:.8rem">
            <button type="button" class="btn btn-ghost wa-fluxo-rm" style="padding:.3rem .6rem;font-size:.8rem"><i class="fas fa-trash"></i></button>
        `;
        box.appendChild(div);
        div.querySelector('.wa-fluxo-rm').addEventListener('click', () => div.remove());
    }

    esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    getFluxos() {
        const items = [...document.querySelectorAll('#wa-fluxos .wa-fluxo-item')];
        return items.map(el => ({
            keyword: (el.querySelector('.wa-fluxo-key').value || '').trim().toLowerCase(),
            response: (el.querySelector('.wa-fluxo-resp').value || '').trim()
        })).filter(f => f.keyword && f.response);
    }

    handleFoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            document.getElementById('perfil-status').innerHTML = '<span style="color:var(--red)">Maximo 5MB. Escolha uma foto menor.</span>';
            return;
        }
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            document.getElementById('perfil-avatar-icon').style.display = 'none';
            const img = document.getElementById('perfil-avatar-img');
            img.src = dataUrl;
            img.style.display = 'block';
            await window.ngr.config.set('perfil_foto', dataUrl);
            document.getElementById('perfil-status').innerHTML = '<span style="color:var(--green)">Foto atualizada!</span>';
        };
        reader.readAsDataURL(file);
    }

    async load() {
        this.switchCSS();
        const config = await window.ngr.config.getAll();
        const nome = config.perfil_nome || '';
        const sobre = config.perfil_sobre || '';
        const negocio = config.perfil_negocio || '';
        const foto = config.perfil_foto || '';
        document.getElementById('perfil-nome').value = nome;
        document.getElementById('perfil-sobre').value = sobre;
        document.getElementById('perfil-negocio').value = negocio;
        document.getElementById('perfil-status').textContent = '';
        if (foto) {
            document.getElementById('perfil-avatar-icon').style.display = 'none';
            const img = document.getElementById('perfil-avatar-img');
            img.src = foto;
            img.style.display = 'block';
        }

        // Carrega configs do WhatsApp (da ponte NGRBOT, se existir; se nao, do config do ERP)
        let wa = {};
        try { wa = (await window.ngr.ngrbot.configGet()) || {}; } catch (e) { wa = {}; }
        await this.loadLicenca(config.wa_groq_key || '');
        const iaAtiva = wa.aiActive !== undefined ? wa.aiActive : (config.wa_ia_ativa !== undefined ? config.wa_ia_ativa === '1' || config.wa_ia_ativa === true : true);
        const groqKey = wa.groqKey || config.wa_groq_key || '';
        const modelo = wa.model || config.wa_modelo || 'groq/compound-mini';
        const prompt = wa.prompt || config.wa_prompt || '';
        let flows = (wa.flows && wa.flows.length) ? wa.flows : [];
        if (!flows.length && config.wa_fluxos) { try { flows = JSON.parse(config.wa_fluxos); } catch { flows = []; } }

        document.getElementById('wa-ia-ativa').checked = iaAtiva;
        document.getElementById('wa-groq-key').value = groqKey;
        document.getElementById('wa-modelo').value = modelo || 'groq/compound-mini';
        document.getElementById('wa-prompt').value = prompt;
        document.getElementById('wa-fluxos').innerHTML = '';
        if (flows && flows.length) {
            flows.forEach(f => this.addFluxo(f.keyword, f.response));
        }
    }

    async saveWhatsApp() {
        const btn = document.getElementById('wa-save');
        const status = document.getElementById('wa-status');
        btn.disabled = true;
        try {
            const groqKey = document.getElementById('wa-groq-key').value.trim();
            const modelo = document.getElementById('wa-modelo').value;
            const prompt = document.getElementById('wa-prompt').value.trim();
            const iaAtiva = document.getElementById('wa-ia-ativa').checked;
            const flows = this.getFluxos();

            // Salva no bd do ERP (persistencia local)
            await window.ngr.config.set('wa_groq_key', groqKey);
            await window.ngr.config.set('wa_modelo', modelo);
            await window.ngr.config.set('wa_prompt', prompt);
            await window.ngr.config.set('wa_ia_ativa', iaAtiva ? '1' : '0');
            await window.ngr.config.set('wa_fluxos', JSON.stringify(flows));

            // Pushe para o NGRBOT via JSON compartilhado
            const payload = { groqKey, model: modelo, prompt, aiActive: iaAtiva, flows };
            let res = { success: true };
            try { res = (await window.ngr.ngrbot.configUpdate(payload)) || { success: true }; } catch (e) { res = { success: false, error: e.message }; }

            if (res.success) {
                status.innerHTML = '<span style="color:var(--green)">Config WhatsApp salva e aplicada ao bot!</span>';
            } else {
                status.innerHTML = '<span style="color:var(--orange)">Salvo localmente, mas nao aplicado ao bot: ' + (res.error || 'erro') + '</span>';
            }
        } catch (e) {
            status.innerHTML = '<span style="color:var(--red)">Erro: ' + e.message + '</span>';
        }
        btn.disabled = false;
    }

    async savePerfil() {
        const nome = document.getElementById('perfil-nome').value.trim();
        const sobre = document.getElementById('perfil-sobre').value.trim();
        const negocio = document.getElementById('perfil-negocio').value.trim();
        await window.ngr.config.set('perfil_nome', nome);
        await window.ngr.config.set('perfil_sobre', sobre);
        await window.ngr.config.set('perfil_negocio', negocio);
        document.getElementById('perfil-status').innerHTML = '<span style="color:var(--green)">Perfil salvo com sucesso!</span>';
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Perfil;
