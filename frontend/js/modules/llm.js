const fmtData = (d) => d ? d.split('-').slice(1).reverse().join('/') : '';

class LLM {
    constructor() {
        this.input = document.getElementById('llm-input');
        this.sendBtn = document.getElementById('llm-send-btn');
        this.voiceBtn = document.getElementById('llm-voice-btn');
        this.messagesEl = document.getElementById('llm-messages');
        this.conversaId = null;
        this.isProcessing = false;
        this.currentResponse = '';
        this.genTimeout = null;
        this.init();
    }

    // Desbloqueia a interface caso a geracao trave/atrase demais (100s).
    // Nesta maquina a CPU e lenta (sem AVX2) e a geracao local leva ~40s;
    // o timer renova a cada token, entao so destrava se travar de verdade.
    stuckTimeout() {
        clearTimeout(this.genTimeout);
        this.genTimeout = setTimeout(() => {
            this.isProcessing = false;
            this.hideTyping();
            if (this.sendBtn) { this.sendBtn.disabled = false; this.sendBtn.classList.remove('disabled'); }
            if (this.input) { this.input.disabled = false; this.input.focus(); }
            this.currentResponse = '';
            this.addMessage('assistant', 'O agente demorou para responder, tente novamente.');
            if (window.ngr && window.ngr.llmAbort) window.ngr.llmAbort().catch(() => {});
        }, 100000);
    }

    init() {
        this.sendBtn.addEventListener('click', () => this.send());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.send(); }
        });
        this.voiceBtn.addEventListener('click', () => this.toggleVoice());

        window.ngr.onLLMToken((text) => {
            // Cada token = stream ativo; renova o watchdog (so destrava se parar).
            this.stuckTimeout();
            if (!this.currentResponse) this.currentResponse = '';
            this.currentResponse += text;
            this.updateLastBubble(text);
        });

        window.ngr.onLLMError((msg) => {
            clearTimeout(this.genTimeout); this.genTimeout = null;
            this.isProcessing = false;
            this.hideTyping();
            if (this.sendBtn) this.sendBtn.disabled = false;
            if (this.input) { this.input.disabled = false; this.input.focus(); }
            const ultima = this.messagesEl.querySelector('.llm-msg.assistant:last-child');
            const texto = (msg && msg !== 'Modulo de IA indisponivel neste hardware.') ? msg : 'O agente demorou para responder, tente novamente.';
            if (ultima && !this.currentResponse.trim()) {
                ultima.querySelector('.llm-bubble').textContent = texto;
            } else {
                this.addMessage('assistant', texto);
            }
            this.currentResponse = '';
        });

        window.ngr.onLLMDone(async (result) => {
            clearTimeout(this.genTimeout); this.genTimeout = null;
            this.isProcessing = false;
            this.hideTyping();
            this.sendBtn.disabled = false;
            this.input.disabled = false;
            this.input.focus();
            // Usa a resposta final limpa vinda do worker (result.texto) sempre
            // que existir; so cai no acumulado de tokens quando vazio.
            const bruto = (result && result.texto && String(result.texto).trim())
                ? String(result.texto)
                : this.currentResponse;
            let texto = this.corrigirCaps(String(bruto || '').trim());
            texto = this.limparResposta(texto);
            this.currentResponse = texto;
            const lastBubble = this.messagesEl.querySelector('.llm-msg.assistant:last-child .llm-bubble');
            if (lastBubble) lastBubble.textContent = texto;
            if (this.conversaId && texto) {
                await window.ngr.conversas.addMsg(this.conversaId, 'assistant', texto);
            }
            if (result.acao && result.acao.acao) {
                await this.executarComando(result.acao);
            }
        });
    }

    async send(texto) {
        if (this.isProcessing) return;
        const raw = texto != null && String(texto).trim() !== '' ? String(texto) : (this.input ? this.input.value || '' : '');
        const text = String(raw || '').trim();
        if (!text || text.length === 0) return;
        if (this.input) this.input.value = '';
        await this.addMessage('user', text);

        if (!this.conversaId) {
            const conv = await window.ngr.conversas.create();
            this.conversaId = conv.id;
        }
        await window.ngr.conversas.addMsg(this.conversaId, 'user', text);

        const cmd = this.parseComando(text);
        if (cmd) {
            await this.executarComando(cmd);
            if (window.refreshCurrentPage) window.refreshCurrentPage();
            return;
        }

        const msgs = await window.ngr.conversas.mensagens(this.conversaId);
        const formatted = msgs.filter(m => m.papel === 'user' || m.papel === 'assistant').map(m => ({ role: m.papel, content: m.conteudo }));
        this.isProcessing = true;
        this.currentResponse = '';
        if (this.sendBtn) this.sendBtn.disabled = true;
        if (this.input) this.input.disabled = true;
        this.showTyping();
        await this.addMessage('assistant', '');
        this.stuckTimeout();
        try {
            const res = await window.ngr.llmGenerate({ messages: formatted });
            // Se o backend ja respondeu com erro de forma sincrona, destrava aqui.
            if (res && res.success === false) {
                clearTimeout(this.genTimeout); this.genTimeout = null;
                this.isProcessing = false;
                this.hideTyping();
                if (this.sendBtn) this.sendBtn.disabled = false;
                if (this.input) { this.input.disabled = false; this.input.focus(); }
                this.addMessage('assistant', 'O agente demorou para responder, tente novamente.');
            }
            // Caso de sucesso: o onLLMToken/onLLMDone cuidam do resto.
        } catch (err) {
            clearTimeout(this.genTimeout); this.genTimeout = null;
            this.isProcessing = false;
            this.hideTyping();
            if (this.sendBtn) this.sendBtn.disabled = false;
            if (this.input) { this.input.disabled = false; this.input.focus(); }
            this.addMessage('assistant', 'O agente demorou para responder, tente novamente.');
        }
    }

    corrigirCaps(texto) {
        const maiusculas = (texto.match(/[A-ZÀ-Ú]/g) || []).length;
        const minusculas = (texto.match(/[a-zà-ú]/g) || []).length;
        const total = maiusculas + minusculas;
        if (total > 0 && maiusculas / total > 0.6) {
            return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
        }
        return texto;
    }

    limparResposta(texto) {
        texto = texto.replace(/<[^>]*>/g, '');
        texto = texto.replace(/\*\*(.*?)\*\*/g, '$1');
        texto = texto.replace(/\*+/g, '');

        texto = texto.split('\n').map(l => l.trim()).filter(l => l).map(l => {
            l = l.replace(/^\d+[.)]\s*/, '');
            l = l.replace(/^-\s+/, '');
            return l;
        }).join('\n');
        texto = texto.replace(/\n{3,}/g, '\n\n');
        texto = texto.split('\n').map(l => l.trim()).join('\n').trim();

        const htmlIndicators = ['<style', '</style', '<div', '<p>', '</p', '<img', 'class=', '<html', '<body', '<head'];
        if (htmlIndicators.some(h => texto.includes(h))) return 'Nao consegui responder a essa pergunta. Pode tentar de outra forma?';

        const garbagePatterns = [
            /\.pdf/i, /\bwww\./i, /\bhttp/i, /\bGoogle\s+Search/i,
            /\.{5,}/, /\n\s*>\s*\n/, /^>\s*$/m,
            /\bNavegue\s+at[eé]\s+/i,
            /\bnao\s+posso\s+(criar|instalar|fornecer|recomendar)/i,
            /\bAmazon/i, /\bcompr[ae]\s+online/i, /\b[Ll]oja\s+oficial/i,
            /\[nome\s+do\s+(seu\s+)?produto\]/i,
            /\[n[úu]mero\s+de\s+unidades\]/i,
        ];
        if (garbagePatterns.some(p => p.test(texto))) return 'Nao consegui responder a essa pergunta. Pode tentar de outra forma?';

        const linhasValidas = texto.split('\n').filter(l => l.trim().length > 3);
        if (linhasValidas.length === 0) return 'Nao sei dizer.';

        const suspeitas = linhasValidas.filter(l => {
            const nums = (l.match(/\d+/g) || []).length;
            return nums >= l.length * 0.3 || l.includes('>') || /^[.\-=>]+$/.test(l.trim());
        });
        if (suspeitas.length > linhasValidas.length * 0.4) return 'Nao consegui responder a essa pergunta. Pode tentar de outra forma?';

        return texto;
    }

    async addMessage(role, text) {
        const div = document.createElement('div');
        div.className = 'llm-msg ' + role;
        const avatar = document.createElement('div');
        avatar.className = 'llm-avatar';
        if (role === 'user') {
            const foto = await window.ngr.config.get('perfil_foto');
            if (foto) {
                avatar.innerHTML = `<img src="${foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            } else {
                avatar.innerHTML = '<i class="fas fa-user"></i>';
            }
        } else {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        }
        const bubble = document.createElement('div');
        bubble.className = 'llm-bubble';
        bubble.textContent = text;
        div.appendChild(role === 'user' ? bubble : avatar);
        div.appendChild(role === 'user' ? avatar : bubble);
        this.messagesEl.appendChild(div);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        return bubble;
    }

    updateLastBubble(text) {
        const bubbles = this.messagesEl.querySelectorAll('.llm-msg.assistant .llm-bubble');
        if (bubbles.length) {
            bubbles[bubbles.length - 1].textContent = this.currentResponse;
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    showTyping() {
        const existing = this.messagesEl.querySelector('.llm-typing');
        if (existing) return;
        const div = document.createElement('div');
        div.className = 'llm-typing';
        div.innerHTML = '<span class="dots">Pensando...</span>';
        this.messagesEl.appendChild(div);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    hideTyping() {
        const el = this.messagesEl.querySelector('.llm-typing');
        if (el) el.remove();
    }

    async toggleVoice() {
        if (this.voiceBtn.classList.contains('listening')) {
            const result = await window.ngr.sttStop();
            this.voiceBtn.classList.remove('listening');
            if (result.success && result.text) {
                this.input.value = result.text;
                this.send();
            }
        } else {
            const result = await window.ngr.sttStart();
            if (result.success) this.voiceBtn.classList.add('listening');
        }
    }

    parseComando(texto) {
        const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        const hoje = () => new Date().toISOString().split('T')[0];
        const extractData = (s) => {
            const d = s.match(/(\d{1,2})[\/\-](\d{1,2})([\/\-](\d{2,4}))?/);
            if (d) {
                const dia = parseInt(d[1]), mes = parseInt(d[2]) - 1;
                let ano = d[4] ? parseInt(d[4]) : new Date().getFullYear();
                if (ano < 100) ano += 2000;
                return new Date(ano, mes, dia).toISOString().split('T')[0];
            }
            return null;
        };
        const pegaNum = (s) => {
            const m = s.match(/(\d+)/);
            return m ? parseInt(m[1]) : null;
        };
        const limpaTitulo = (s) => {
            return s
                .replace(/(?:com\s+)?(?:o\s+)?(?:nome|titulo|apelido)\s*:?\s*/gi, '')
                .replace(/(?:chamado|chamada)\s*:?\s*/gi, '')
                .replace(/\b(hoje|amanha|ontem|agora|depois)\s*/gi, '')
                .replace(/\bprioridade\s+(alta|media|baixa)\s*/gi, '')
                .replace(/\s+(\d+)[.,]?\d*\s*reais?\s*/gi, ' ')
                .replace(/^[:,\s;.-]+|[:,\s;.-]+$/g, '')
                .replace(/\s{2,}/g, ' ').trim();
        };

        const tem = (p) => new RegExp(p).test(t);

        const mesesNome = { janeiro:0,fevereiro:1,marco:2,abril:3,maio:4,junho:5,julho:6,agosto:7,setembro:8,outubro:9,novembro:10,dezembro:11 };
        const extractMes = (s) => {
            const agora = new Date();
            if (tem('esse mes|este mes|desse mes|nesse mes')) return { mes: agora.getMonth(), ano: agora.getFullYear() };
            if (tem('mes passado|ultimo mes|mes anterior')) {
                const d = new Date(agora); d.setMonth(d.getMonth()-1);
                return { mes: d.getMonth(), ano: d.getFullYear() };
            }
            if (tem('proximo mes|mes que vem')) {
                const d = new Date(agora); d.setMonth(d.getMonth()+1);
                return { mes: d.getMonth(), ano: d.getFullYear() };
            }
            for (const [nome, idx] of Object.entries(mesesNome)) {
                if (tem(nome)) {
                    const matchAno = s.match(/(\d{4})/);
                    return { mes: idx, ano: matchAno ? parseInt(matchAno[1]) : agora.getFullYear() };
                }
            }
            return null;
        };
        const formatMesAno = (m, a) => {
            const mesesL = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            return `${mesesL[m]}/${a}`;
        };

        const intencao = () => {
            if (tem('cri|nov[ao]|cadastr|registr|adicion')) return 'criar';
            if (tem('list|mostr|exib|tod[asou]|quai[sz]|\\bver\\b|\\bexiste\\b|\\btem\\b')) return 'listar';
            if (tem('pag|quit|baix')) return 'pagar';
            if (tem('delet|remov|exclu|apag')) return 'deletar';
            if (tem('conclu|finaliz|complet|feit')) return 'concluir';
            if (tem('atuali|alter|modific|edit|renome|mud[ao]|troc')) return 'atualizar';
            if (tem('previs|projec|prever|preveja')) return 'previsao';
            if (tem('resumo|panorama|situac|extrato|saldo|quanto.devo|qual.minha.divid')) return 'resumo';
            return null;
        };
        const entidade = () => {
            if (tem('cont')) return 'conta';
            if (tem('taref')) return 'tarefa';
            if (tem('fich')) return 'ficha';
            if (tem('event')) return 'evento';
            if (tem('prod|estoque|mercadoria|item')) return 'produto';
            if (tem('venda|pedido|orcament')) return 'venda';
            if (tem('client|comprador')) return 'cliente';
            if (tem('forneced')) return 'fornecedor';
            if (tem('previs|prec|projec')) return 'previsao';
            return null;
        };

        const acao = intencao();
        const alvo = entidade();
        const periodo = extractMes(t);

        // Saude do negocio / visao geral
        if (tem('saud|panorama|visao.geral|resumo.geral|como.esta|tudo.bem|tudo.certo') &&
            tem('negoci|empres|sistem|meu')) {
            return { acao: 'saude_negocio', dados: {} };
        }
        if (tem('saud|panorama|como.esta|tudo.bem|tudo.certo') && !tem('cont|taref|vend|prod|client|forneced')) {
            return { acao: 'saude_negocio', dados: {} };
        }

        // Relatorios / relatorios recentes
        if (tem('relatori|report|dashboard') || tem('recent') && tem('relatori|report|dados|numeros')) {
            return { acao: 'consultar_relatorios', dados: {} };
        }

        if ((tem('oque|o.que|o.que.tenho|o.que.preciso|o.que.devo|tenho.que|preciso|devo') || tem('para.pagar|a.pagar')) && tem('cont')) {
            const filtro = { status: 'pendente' };
            if (periodo) filtro.mes = periodo.mes, filtro.ano = periodo.ano;
            return { acao: 'consultar_contas', dados: { tipo: 'a_pagar', ...filtro } };
        }
        if (tem('receb|receit|ganh|entrad|rend') && tem('cont')) {
            const filtro = { tipo: 'receita' };
            if (periodo) filtro.mes = periodo.mes, filtro.ano = periodo.ano;
            return { acao: 'consultar_contas', dados: { tipo: 'receitas', ...filtro } };
        }
        if (tem('tenh.*cont|tem.*cont|existe.*cont|ha.*cont') || (tem('cont') && tem('pendente|atrasad|aberta'))) {
            return { acao: 'consultar_contas', dados: { tipo: 'pendentes' } };
        }
        if (alvo === 'conta') {
            if (periodo) return { acao: 'consultar_contas', dados: { tipo: 'do_mes', mes: periodo.mes, ano: periodo.ano } };
            if (tem('tenh|tem|ha|existe|precis|quer|mostr|list|tod')) {
                return { acao: 'consultar_contas', dados: { tipo: periodo ? 'do_mes' : 'todas' } };
            }
        }
        if (tem('quanto.devo|qual.minha.divid|total.pendente|total.a.pagar')) {
            return { acao: 'resumo_financeiro', dados: {} };
        }

        if (acao === 'criar' && alvo === 'conta') {
            const valor = pegaNum(t) || 0;
            const tipo = /receit|renda|entrad|salario/.test(t) ? 'receita' : 'despesa';
            const tituloExtra = t.replace(/cri[^ ]*\s+/, '').replace(/cont[^ ]*\s+(?:de\s+|chamad[ao]\s*:?\s*|(?:com\s+)?(?:o\s+)?nome\s*:?\s*)?/, '');
            let nome = limpaTitulo(tituloExtra.replace(/(?:com\s+)?valor\s*/gi, '').replace(/\d+[.,]?\d*\s*reais?/gi, '').replace(/(?:vencimento|para|em)\s+\S+(\s+\S+)?/gi, ''));
            if (!nome || nome.length < 2) nome = 'Conta';
            nome = nome.charAt(0).toUpperCase() + nome.slice(1);
            const dataV = extractData(t) || hoje();
            return { acao: 'criar_conta', dados: { descricao: nome, valor, data_vencimento: dataV, tipo, categoria_id: null, observacao: null } };
        }

        if (acao === 'pagar' && (alvo === 'conta' || !alvo)) {
            const id = pegaNum(t);
            if (id) return { acao: 'pagar_conta', dados: { id, data_pagamento: hoje() } };
            const nomeMatch = t.match(/(?:conta\s*:?\s*)(.+?)(?:,|\s+como\s+|$)/i);
            if (nomeMatch) {
                const nome = limpaTitulo(nomeMatch[1]);
                if (nome) return { acao: 'pagar_conta', dados: { nome, data_pagamento: hoje() } };
            }
        }

        if (acao === 'listar' && alvo === 'conta') {
            const filtro = {};
            if (tem('pendente|nao.paga|aberta')) filtro.status = 'pendente';
            if (tem('pag[ao]')) filtro.status = 'pago';
            if (tem('atrasad')) filtro.status = 'atrasado';
            if (tem('receit')) filtro.tipo = 'receita';
            if (tem('despes')) filtro.tipo = 'despesa';
            return { acao: 'listar_contas', dados: filtro };
        }

        if (acao === 'deletar' && alvo === 'conta') {
            const id = pegaNum(t);
            if (id) return { acao: 'deletar_conta', dados: { id } };
            const nomeMatch = t.match(/(?:conta\s*:?\s*)(.+?)(?:,|\s+como\s+|$)/i);
            if (nomeMatch) {
                const nome = limpaTitulo(nomeMatch[1]);
                if (nome) return { acao: 'deletar_conta', dados: { nome } };
            }
        }

        if (acao === 'atualizar' && alvo === 'conta') {
            const id = pegaNum(t);
            if (id) {
                const dados = { id };
                const mNovoNome = t.match(/(?:nome|titulo|descricao|para|chamar)\s+(.+)/);
                if (mNovoNome) dados.descricao = limpaTitulo(mNovoNome[1]);
                const mValor = t.match(/valor\s+(\d+[.,]?\d*)/);
                if (mValor) dados.valor = parseFloat(mValor[1].replace(',', '.'));
                return { acao: 'atualizar_conta', dados };
            }
        }

        if (acao === 'criar' && alvo === 'tarefa') {
            const textoAposCriar = t.replace(/^.*?cri[^ ]*\s+/, '');
            let nome = textoAposCriar.replace(/^(?:uma?\s+|a\s+)?taref[ae]?\s*(?:de\s+|chamad[ao]\s*:?\s*|(?:com\s+)?(?:o\s+)?nome\s*:?\s*)?/, '');
            nome = limpaTitulo(nome);
            if (!nome || nome.length < 2) nome = 'Nova tarefa';
            nome = nome.charAt(0).toUpperCase() + nome.slice(1);
            const prioridade = tem('alta') ? 'alta' : tem('baixa') ? 'baixa' : 'media';
            const dataV = extractData(t) || (tem('hoje|agora') ? hoje() : null);
            return { acao: 'criar_tarefa', dados: { titulo: nome, descricao: null, prioridade, data_vencimento: dataV } };
        }

        if (acao === 'listar' && alvo === 'tarefa') {
            const filtro = {};
            if (tem('pendente|aberta')) filtro.status = 'pendente';
            if (tem('concluid')) filtro.status = 'concluida';
            return { acao: 'listar_tarefas', dados: filtro };
        }

        if (acao === 'concluir' && alvo === 'tarefa') {
            const id = pegaNum(t);
            if (id) return { acao: 'concluir_tarefa', dados: { id } };
            const nomeMatch = t.match(/(?:tarefa\s*:?\s*)(.+?)(?:,|\s+como\s+|$)/i);
            if (nomeMatch) {
                const nome = limpaTitulo(nomeMatch[1]);
                if (nome) return { acao: 'concluir_tarefa', dados: { nome } };
            }
        }

        if (acao === 'deletar' && alvo === 'tarefa') {
            const id = pegaNum(t);
            if (id) return { acao: 'deletar_tarefa', dados: { id } };
            const nomeMatch = t.match(/(?:tarefa\s*:?\s*)(.+?)(?:,|\s+como\s+|$)/i);
            if (nomeMatch) {
                const nome = limpaTitulo(nomeMatch[1]);
                if (nome) return { acao: 'deletar_tarefa', dados: { nome } };
            }
        }

        if (acao === 'atualizar' && alvo === 'tarefa') {
            const id = pegaNum(t);
            if (id) {
                const dados = { id };
                const mNome = t.match(/(?:nome|titulo|descricao|para|chamar)\s+(.+)/);
                if (mNome) dados.titulo = limpaTitulo(mNome[1]);
                return { acao: 'atualizar_tarefa', dados };
            }
        }

        if (acao === 'resumo' || (tem('resumo') && alvo === 'conta')) {
            return { acao: 'resumo_financeiro', dados: {} };
        }

        if (acao === 'criar' && alvo === 'ficha') {
            const nome = limpaTitulo(t.replace(/^.*?cri[^ ]*\s+/, '').replace(/fich[ae]\s*(de\s+)?/, ''));
            return { acao: 'criar_ficha', dados: { titulo: nome || 'Nova ficha', conteudo: '' } };
        }

        if (acao === 'criar' && alvo === 'evento') {
            const nome = limpaTitulo(t.replace(/^.*?cri[^ ]*\s+/, '').replace(/event[o]\s*(de\s+)?/, ''));
            return { acao: 'criar_evento', dados: { titulo: nome || 'Evento', data_inicio: extractData(t) || hoje(), tipo: 'evento' } };
        }

        if (acao === 'criar' && alvo === 'produto') {
            const nome = limpaTitulo(t.replace(/^.*?cri[^ ]*\s+/, '').replace(/produt[o]\s*(chamado|com.o.nome|de)?\s*/, ''));
            const precos = t.match(/(\d+[.,]?\d*)/g);
            const preco_venda = precos ? parseFloat(precos[0].replace(',', '.')) : 0;
            return { acao: 'criar_produto', dados: { nome: nome || 'Novo produto', preco_venda, estoque_atual: 0, unidade: 'un' } };
        }

        if (acao === 'listar' && alvo === 'produto') {
            const filtro = {};
            if (tem('baixo|minimo|repor')) filtro.estoque_baixo = true;
            return { acao: 'listar_produtos', dados: filtro };
        }

        if (acao === 'listar' && alvo === 'venda') {
            const filtro = {};
            if (periodo) { filtro.data_inicio = `${periodo.ano}-${String(periodo.mes+1).padStart(2,'0')}-01`; }
            return { acao: 'listar_vendas', dados: filtro };
        }

        if (acao === 'listar' && alvo === 'cliente') {
            return { acao: 'listar_clientes', dados: {} };
        }

        if (acao === 'listar' && alvo === 'fornecedor') {
            return { acao: 'listar_fornecedores', dados: {} };
        }

        if ((acao === 'previsao' || alvo === 'previsao') && tem('receit|despes|fluxo|financeir')) {
            const tipo = tem('receit') ? 'receita' : tem('despes') ? 'despesa' : 'fluxo';
            return { acao: 'prever_financeiro', dados: { tipo } };
        }

        if ((acao === 'previsao' || alvo === 'previsao') && tem('demand|prod')) {
            return { acao: 'prever_demanda', dados: {} };
        }

        // Navegacao guiada por voz/texto
        const todasPaginas = ['dashboard', 'contas', 'vendas', 'estoque', 'clientes', 'tarefas', 'calendario', 'fichas', 'documentos', 'relatorios', 'perfil'];

        // Fuzzy match para navegacao com erros de digitacao
        const navVerb = /(?:v[aá]\s+|vai\s+|abrir|mostrar|exibir|ir\s+|lev[ae]r?|me\s+lev[ae])\s*(?:para|no|na|ate|ateh?|apagina)?\s*(.+)/i;
        const navMatch = t.match(navVerb);
        if (navMatch) {
            const target = navMatch[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const page of todasPaginas) {
                if (target.includes(page) || page.includes(target) || (target.length >= 4 && page.startsWith(target.slice(0, 4)))) {
                    return { acao: 'navegar', dados: { pagina: page } };
                }
            }
        }

        const navMap = {
            dashboard: ['dashboard', 'painel', 'inicio', 'principal', 'home'],
            contas: ['contas', 'financeiro', 'pagamentos', 'contas.?a.?pagar', 'contas.?a.?receber'],
            vendas: ['vendas', 'vender', 'compras', 'pedidos'],
            estoque: ['estoque', 'produtos', 'mercadorias', 'itens', 'inventario'],
            clientes: ['clientes', 'consumidores', 'crm'],
            tarefas: ['tarefas', 'tarefa', 'afazeres', 'checklist'],
            calendario: ['calendario', 'agenda', 'eventos'],
            fichas: ['fichas', 'ficha.?tecnica'],
            documentos: ['documentos', 'arquivos'],
            relatorios: ['relatorios', 'relatorio', 'graficos'],
            perfil: ['perfil', 'configuracoes', 'config'],
        };
        for (const [page, keywords] of Object.entries(navMap)) {
            for (const kw of keywords) {
                if (tem(`v[aá]\\s*(?:para|no|na)?\\s*${kw}`) || tem(`(?:abrir|mostrar|exibir|ir|lev[ae]r?)\\s*(?:para|no|na|ate)?\\s*${kw}`) || tem(`me\\s+lev[ae]\\s*(?:para|ate)?\\s*${kw}`)) {
                    return { acao: 'navegar', dados: { pagina: page } };
                }
            }
        }

        return null;
    }

    async executarComando(cmd) {
        try {
            const { acao, dados } = cmd;
            let resultado, msg;
            switch (acao) {
                case 'consultar_contas': {
                    const todas = await window.ngr.contas.list();
                    let filtradas = todas;
                    if (dados.mes !== undefined && dados.ano !== undefined) {
                        filtradas = todas.filter(c => {
                            if (!c.data_vencimento) return false;
                            const [a, m] = c.data_vencimento.split('-');
                            return parseInt(m) === dados.mes + 1 && parseInt(a) === dados.ano;
                        });
                    }
                    if (dados.status) filtradas = filtradas.filter(c => c.status === dados.status);
                    if (dados.tipo === 'receita') filtradas = filtradas.filter(c => c.tipo === 'receita');
                    if (!filtradas.length) {
                        msg = 'Nenhuma conta encontrada no periodo.';
                        break;
                    }
                    const hojeStr = new Date().toISOString().split('T')[0];
                    const aVencer = filtradas.filter(c => c.status !== 'pago' && c.status !== 'cancelado' && c.data_vencimento >= hojeStr);
                    const atrasadas = filtradas.filter(c => c.status !== 'pago' && c.status !== 'cancelado' && c.data_vencimento < hojeStr);
                    const pagas = filtradas.filter(c => c.status === 'pago');
                    let linhas = [];
                    if (atrasadas.length) linhas.push(`⚠️ ${atrasadas.length} atrasada(s): ${atrasadas.map(c => `${c.descricao} (R$ ${Number(c.valor).toFixed(2)})`).join(', ')}`);
                    if (aVencer.length) linhas.push(`📅 ${aVencer.length} a vencer: ${aVencer.map(c => `${c.descricao} R$ ${Number(c.valor).toFixed(2)} venc ${fmtData(c.data_vencimento)}`).join(', ')}`);
                    if (pagas.length) linhas.push(`✅ ${pagas.length} paga(s): ${pagas.map(c => c.descricao).join(', ')}`);
                    const total = filtradas.reduce((s, c) => s + (c.status !== 'pago' && c.status !== 'cancelado' ? Number(c.valor) : 0), 0);
                    linhas.push(`Total: R$ ${total.toFixed(2)}`);
                    msg = linhas.join('\n');
                    break;
                }
                case 'criar_conta':
                    resultado = await window.ngr.contas.create(dados);
                    msg = `Conta criada: ${resultado.descricao} - R$ ${Number(resultado.valor).toFixed(2)}`;
                    break;
                case 'pagar_conta':
                    if (dados.nome) {
                        const lista = await window.ngr.contas.list({ descricao: dados.nome });
                        if (!lista.length) { msg = `Nenhuma conta encontrada com "${dados.nome}".`; break; }
                        resultado = await window.ngr.contas.pagar(lista[0].id, dados.data_pagamento);
                    } else {
                        resultado = await window.ngr.contas.pagar(dados.id, dados.data_pagamento);
                    }
                    msg = `Conta "${resultado.descricao}" marcada como paga.`;
                    break;
                case 'listar_contas': {
                    const lista = await window.ngr.contas.list(dados || {});
                    if (!lista.length) { msg = 'Nenhuma conta encontrada.'; break; }
                    msg = lista.map(c => `- ${c.descricao}: R$ ${Number(c.valor).toFixed(2)} (${c.status})`).join('\n');
                    break;
                }
                case 'atualizar_conta': {
                    const { id, nome, ...resto } = dados;
                    const alvoId = id || (await window.ngr.contas.list({ descricao: nome }))[0]?.id;
                    if (!alvoId) { msg = 'Conta nao encontrada.'; break; }
                    resultado = await window.ngr.contas.update(alvoId, resto);
                    msg = `Conta atualizada: ${resultado.descricao}`;
                    break;
                }
                case 'deletar_conta':
                    if (dados.nome) {
                        const lista = await window.ngr.contas.list({ descricao: dados.nome });
                        if (!lista.length) { msg = `Nenhuma conta encontrada com "${dados.nome}".`; break; }
                        await window.ngr.contas.remove(lista[0].id);
                    } else {
                        await window.ngr.contas.remove(dados.id);
                    }
                    msg = 'Conta removida.';
                    break;
                case 'criar_tarefa':
                    resultado = await window.ngr.tarefas.create(dados);
                    msg = `Tarefa criada: ${resultado.titulo}`;
                    break;
                case 'listar_tarefas': {
                    const lista = await window.ngr.tarefas.list(dados || {});
                    if (!lista.length) { msg = 'Nenhuma tarefa encontrada.'; break; }
                    msg = lista.map(t => `- ${t.titulo} (${t.status})`).join('\n');
                    break;
                }
                case 'concluir_tarefa':
                    if (dados.nome) {
                        const lista = await window.ngr.tarefas.list({ titulo: dados.nome });
                        if (!lista.length) { msg = `Nenhuma tarefa encontrada com "${dados.nome}".`; break; }
                        resultado = await window.ngr.tarefas.update(lista[0].id, { status: 'concluida' });
                    } else {
                        resultado = await window.ngr.tarefas.update(dados.id, { status: 'concluida' });
                    }
                    msg = `Tarefa "${resultado.titulo}" concluida.`;
                    break;
                case 'atualizar_tarefa': {
                    const { id: idT, nome, ...restoT } = dados;
                    const alvoId = idT || (await window.ngr.tarefas.list({ titulo: nome }))[0]?.id;
                    if (!alvoId) { msg = 'Tarefa nao encontrada.'; break; }
                    resultado = await window.ngr.tarefas.update(alvoId, restoT);
                    msg = `Tarefa renomeada para "${resultado.titulo}".`;
                    break;
                }
                case 'deletar_tarefa':
                    if (dados.nome) {
                        const lista = await window.ngr.tarefas.list({ titulo: dados.nome });
                        if (!lista.length) { msg = `Nenhuma tarefa encontrada com "${dados.nome}".`; break; }
                        await window.ngr.tarefas.remove(lista[0].id);
                    } else {
                        await window.ngr.tarefas.remove(dados.id);
                    }
                    msg = 'Tarefa removida.';
                    break;
                case 'criar_ficha':
                    resultado = await window.ngr.fichas.create(dados);
                    msg = `Ficha criada: ${resultado.titulo}`;
                    break;
                case 'listar_fichas': {
                    const lista = await window.ngr.fichas.list(dados || {});
                    if (!lista.length) { msg = 'Nenhuma ficha encontrada.'; break; }
                    msg = lista.map(f => `- ${f.titulo} (${f.status})`).join('\n');
                    break;
                }
                case 'criar_evento':
                    resultado = await window.ngr.eventos.create(dados);
                    msg = `Evento criado: ${resultado.titulo}`;
                    break;
                case 'listar_eventos': {
                    const lista = await window.ngr.eventos.list(dados || {});
                    if (!lista.length) { msg = 'Nenhum evento encontrado.'; break; }
                    msg = lista.map(e => `- ${e.titulo} (${fmtData(e.data_inicio)})`).join('\n');
                    break;
                }
                case 'resumo_financeiro': {
                    const r = await window.ngr.contas.resumo();
                    msg = `Resumo Financeiro:\nPendentes: R$ ${Number(r.pendentes).toFixed(2)}\nA vencer (7 dias): R$ ${Number(r.vencendo).toFixed(2)}\nAtrasadas: R$ ${Number(r.atrasadas).toFixed(2)}\nPagas este mes: R$ ${Number(r.pagas).toFixed(2)}`;
                    break;
                }
                case 'criar_produto':
                    resultado = await window.ngr.produtos.create(dados);
                    msg = `Produto criado: ${resultado.nome}`;
                    break;
                case 'listar_produtos': {
                    const lista = await window.ngr.produtos.list(dados);
                    if (!lista.length) { msg = 'Nenhum produto encontrado.'; break; }
                    msg = lista.map(p => `- ${p.nome} (estoque: ${p.estoque_atual}, R$ ${Number(p.preco_venda).toFixed(2)})`).join('\n');
                    break;
                }
                case 'listar_vendas': {
                    const lista = await window.ngr.vendas.list(dados);
                    if (!lista.length) { msg = 'Nenhuma venda encontrada.'; break; }
                    msg = lista.map(v => `- #${v.id} ${v.cliente_nome || 'Consumidor'}: R$ ${Number(v.total_final).toFixed(2)} (${v.data})`).join('\n');
                    break;
                }
                case 'listar_clientes': {
                    const lista = await window.ngr.clientes.list(dados);
                    if (!lista.length) { msg = 'Nenhum cliente encontrado.'; break; }
                    msg = lista.map(c => `- ${c.nome} ${c.email ? '('+c.email+')' : ''} - R$ ${Number(c.total_compras).toFixed(2)} em compras`).join('\n');
                    break;
                }
                case 'listar_fornecedores': {
                    const lista = await window.ngr.fornecedores.list(dados);
                    if (!lista.length) { msg = 'Nenhum fornecedor encontrado.'; break; }
                    msg = lista.map(f => `- ${f.nome} ${f.contato ? '('+f.contato+')' : ''}`).join('\n');
                    break;
                }
                case 'prever_financeiro': {
                    const res = await window.ngr.previsao.financeiro(dados.tipo, 3);
                    if (!res) { msg = `Sem dados historicos suficientes para prever ${dados.tipo}.`; break; }
                    msg = `Previsao de ${dados.tipo} (proximos 3 meses):\n` + res.previsoes.map(p => `${p.periodo}: R$ ${Number(p.previsao).toFixed(2)}`).join('\n');
                    msg += `\nMedia historica: R$ ${Number(res.media).toFixed(2)}`;
                    break;
                }
                case 'prever_demanda': {
                    const prods = await window.ngr.produtos.list({ ativo: 1 });
                    if (!prods.length) { msg = 'Nenhum produto cadastrado para prever demanda.'; break; }
                    const res = await window.ngr.previsao.demanda(prods[0].id, 3);
                    if (!res) { msg = 'Sem dados de vendas suficientes para prever demanda.'; break; }
                    msg = `Previsao de demanda para "${prods[0].nome}":\n` + res.previsoes.map(p => `${p.periodo}: ${p.previsao} unidades`).join('\n');
                    msg += `\nMedia historica: ${res.media.toFixed(1)} unidades/mes`;
                    break;
                }
                case 'navegar': {
                    const page = dados.pagina;
                    if (window.navigate && page) {
                        window.navigate(page);
                        msg = `Navegando para ${page}...`;
                    } else {
                        msg = 'Pagina nao encontrada.';
                    }
                    break;
                }
                case 'saude_negocio': {
                    const [resumo, contas, tarefas, vendas, produtos] = await Promise.all([
                        window.ngr.contas.resumo(),
                        window.ngr.contas.list(),
                        window.ngr.tarefas.list(),
                        window.ngr.vendas.resumo(1),
                        window.ngr.produtos.list(),
                    ]);
                    const hojeStr = new Date().toISOString().split('T')[0];
                    const atrasadas = contas.filter(c => c.status !== 'pago' && c.status !== 'cancelado' && c.data_vencimento < hojeStr);
                    const tPend = tarefas.filter(t => t.status === 'pendente' || t.status === 'andamento').length;
                    const estoqueBaixo = produtos.filter(p => p.estoque_atual <= p.estoque_minimo).length;
                    const vendasValor = Number(vendas.total || 0);
                    const vendasQtd = Number(vendas.quantidade || 0);
                    msg = `📊 *Saude do Negocio*\n\n`;
                    msg += `💰 Financeiro: R$ ${Number(resumo.pendentes).toFixed(2)} pendentes, ${atrasadas.length} atrasada(s), R$ ${Number(resumo.pagas).toFixed(2)} pagas no mes\n`;
                    msg += `📦 Vendas no mes: R$ ${vendasValor.toFixed(2)} (${vendasQtd} vendas)\n`;
                    msg += `📋 ${tPend} tarefa(s) pendente(s)\n`;
                    msg += `⚠️ ${estoqueBaixo} produto(s) com estoque baixo\n`;
                    msg += `👥 ${produtos.length} produto(s) cadastrado(s)`;
                    if (atrasadas.length) msg += `\n\n🔴 Atencao: ${atrasadas.length} conta(s) atrasada(s)!`;
                    if (estoqueBaixo) msg += `\n🟡 Atencao: ${estoqueBaixo} produto(s) com estoque baixo!`;
                    msg += `\n\nQuer detalhes de algo especifico?`;
                    break;
                }
                case 'consultar_relatorios': {
                    const [resumo, vendas, tarefas] = await Promise.all([
                        window.ngr.contas.resumo(),
                        window.ngr.vendas.resumo(3),
                        window.ngr.tarefas.list(),
                    ]);
                    const tPend2 = tarefas.filter(t => t.status === 'pendente' || t.status === 'andamento').length;
                    msg = 'Relatorios Recentes:\n\n';
                    msg += 'Ultimos 3 meses de vendas:\n';
                    if (vendas && vendas.mensal && vendas.mensal.length) {
                        msg += vendas.mensal.map(h => '  ' + h.mes + ': R$ ' + Number(h.total).toFixed(2) + ' (' + h.qtd + ' vendas)').join('\n');
                    } else {
                        msg += '  Nenhuma venda nos ultimos meses.\n';
                    }
                    msg += '\n\nResumo financeiro:\n';
                    msg += '  Pendentes: R$ ' + Number(resumo.pendentes).toFixed(2) + '\n';
                    msg += '  Pagas no mes: R$ ' + Number(resumo.pagas).toFixed(2) + '\n';
                    msg += '  Atrasadas: R$ ' + Number(resumo.atrasadas).toFixed(2) + '\n';
                    msg += '\n' + tPend2 + ' tarefa(s) pendente(s)\n';
                    msg += '\nQuer ver relatorios completos? Posso te levar ate la!';
                    break;
                }
                default:
                    msg = `Comando "${acao}" nao reconhecido.`;
            }
            if (msg) {
                await this.addMessage('assistant', msg);
                if (this.conversaId) {
                    await window.ngr.conversas.addMsg(this.conversaId, 'system', msg);
                }
            }
            if (window.refreshCurrentPage) window.refreshCurrentPage();
        } catch (e) {
            console.error('[LLM][acao] Falha ao executar acao no banco:', e);
            await this.addMessage('assistant', 'Ocorreu um erro ao salvar no sistema.');
            if (this.conversaId) {
                await window.ngr.conversas.addMsg(this.conversaId, 'system', 'Ocorreu um erro ao salvar no sistema.');
            }
        } finally {
            this.isProcessing = false;
        }
    }
}
export default LLM;
