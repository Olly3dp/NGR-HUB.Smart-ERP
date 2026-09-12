import { pieChart, stepLineChart } from './charts.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

class Relatorios {
    constructor(container) {
        this.container = container;
        this.activeTab = 'financeiro';
        this.produtos = [];
    }

    async init() {
        this.render();
        this.bindEvents();
        await this.load();
    }

    render() {
        this.container.innerHTML =
            '<style>' +
            '.tab-bar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:16px;}' +
            '.tab-btn{padding:10px 20px;background:none;border:none;color:var(--text2);cursor:pointer;font-size:.85rem;border-bottom:2px solid transparent;transition:all .2s;}' +
            '.tab-btn:hover{color:var(--text);background:var(--bg3);}' +
            '.tab-btn.active{color:var(--primary);border-bottom-color:var(--primary);}' +
            '.tab-content{animation:fadeIn .2s;}' +
            '@keyframes fadeIn{from{opacity:0}to{opacity:1}}' +
            '.chart-container{display:flex;align-items:flex-end;gap:6px;height:180px;padding:16px 0 0;}' +
            '.chart-col{display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;}' +
            '.chart-bar{width:100%;max-width:36px;border-radius:4px 4px 0 0;min-height:2px;transition:height .4s;}' +
            '.chart-label{font-size:.65rem;color:var(--text2);margin-top:6px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}' +
            '.chart-value{font-size:.65rem;color:var(--text);margin-bottom:2px;}' +
            '.pred-tipo{display:flex;align-items:center;gap:6px;font-size:.75rem;color:var(--text2);margin-bottom:8px;}' +
            '.pred-tipo .dot{width:10px;height:10px;border-radius:50%;}' +
            '.regra-form-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}' +
            '.regra-form-row-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}' +
            '@media(max-width:768px){.regra-form-row,.regra-form-row-2{grid-template-columns:1fr;}}' +
            '</style>' +
            '<div class="tab-bar">' +
                '<button class="tab-btn active" data-tab="financeiro">Financeiro</button>' +
                '<button class="tab-btn" data-tab="demanda">Previsão de Demanda</button>' +
                '<button class="tab-btn" data-tab="precificacao">Precificação Dinâmica</button>' +
            '</div>' +
            '<div class="tab-content" id="tab-financeiro">' +
                '<div class="grid-4" id="fin-summary">' +
                    '<div class="stat-card warning"><i class="fas fa-clock stat-icon"></i><div class="stat-label">Pendentes</div><div class="stat-value" id="fin-pendentes">-</div></div>' +
                    '<div class="stat-card primary"><i class="fas fa-hourglass-half stat-icon"></i><div class="stat-label">A Vencer</div><div class="stat-value" id="fin-vencendo">-</div></div>' +
                    '<div class="stat-card danger"><i class="fas fa-exclamation-triangle stat-icon"></i><div class="stat-label">Atrasadas</div><div class="stat-value" id="fin-atrasadas">-</div></div>' +
                    '<div class="stat-card success"><i class="fas fa-check-circle stat-icon"></i><div class="stat-label">Pagas este Mês</div><div class="stat-value" id="fin-pagas">-</div></div>' +
                '</div>' +
                '<div class="grid-3 mb-2" id="fin-vendas-summary">' +
                    '<div class="stat-card primary"><i class="fas fa-dollar-sign stat-icon"></i><div class="stat-label">Total Vendas</div><div class="stat-value" id="fin-total-vendas">-</div></div>' +
                    '<div class="stat-card primary"><i class="fas fa-shopping-cart stat-icon"></i><div class="stat-label">Quantidade</div><div class="stat-value" id="fin-qtd-vendas">-</div></div>' +
                    '<div class="stat-card primary"><i class="fas fa-receipt stat-icon"></i><div class="stat-label">Ticket Médio</div><div class="stat-value" id="fin-ticket-medio">-</div></div>' +
                '</div>' +
                '<div class="card mb-2">' +
                    '<div class="card-header"><h3>Vendas Mensais</h3></div>' +
                    '<div id="fin-chart-vendas"><div class="empty-state"><p>Carregando...</p></div></div>' +
                '</div>' +
                '<div class="card mb-2">' +
                    '<div class="card-header"><h3><i class="fas fa-chart-pie" style="color:var(--primary)"></i> Vendas e Despesas</h3></div>' +
                    '<div id="fin-chart-pizza"><div class="empty-state"><p>Carregando...</p></div></div>' +
                '</div>' +
                '<div class="card mb-2">' +
                    '<div class="card-header"><h3><i class="fas fa-chart-line" style="color:var(--primary)"></i> Vendas em Escadas</h3></div>' +
                    '<div id="fin-chart-escadas"><div class="empty-state"><p>Carregando...</p></div></div>' +
                '</div>' +
                '<div class="card">' +
                    '<div class="card-header"><h3>Previsão de Fluxo de Caixa</h3></div>' +
                    '<div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">' +
                        '<button class="btn btn-primary" id="btn-prever-receitas"><i class="fas fa-arrow-up"></i> Prever Receitas</button>' +
                        '<button class="btn btn-ghost" id="btn-prever-despesas"><i class="fas fa-arrow-down"></i> Prever Despesas</button>' +
                    '</div>' +
                    '<div id="fin-previsao-table"></div>' +
                '</div>' +
            '</div>' +
            '<div class="tab-content hidden" id="tab-demanda">' +
                '<div class="filter-bar mb-2">' +
                    '<select class="form-control" id="sel-produto-demanda" style="min-width:240px;">' +
                        '<option value="">Selecione um produto</option>' +
                    '</select>' +
                    '<button class="btn btn-primary" id="btn-calcular-previsao"><i class="fas fa-chart-line"></i> Calcular Previsão</button>' +
                '</div>' +
                '<div id="demanda-results">' +
                    '<div class="empty-state"><i class="fas fa-chart-line"></i><p>Selecione um produto e clique em "Calcular Previsão"</p></div>' +
                '</div>' +
            '</div>' +
            '<div class="tab-content hidden" id="tab-precificacao">' +
                '<div class="filter-bar mb-2">' +
                    '<select class="form-control" id="sel-produto-precificacao" style="min-width:240px;">' +
                        '<option value="">Selecione um produto</option>' +
                    '</select>' +
                    '<button class="btn btn-primary" id="btn-calcular-sugerido"><i class="fas fa-calculator"></i> Calcular Preço Sugerido</button>' +
                '</div>' +
                '<div id="precificacao-info"></div>' +
                '<div class="card mb-2 mt-2">' +
                    '<div class="card-header"><h3>Regras de Precificação</h3></div>' +
                    '<div class="table-wrap"><table>' +
                        '<thead><tr><th>Nome</th><th>Tipo</th><th>Valor</th><th>Período</th><th>Status</th><th>Ações</th></tr></thead>' +
                        '<tbody id="regras-tbody"></tbody>' +
                    '</table></div>' +
                    '<div id="regras-empty" class="empty-state hidden"><i class="fas fa-tag"></i><p>Nenhuma regra cadastrada</p></div>' +
                '</div>' +
                '<div class="card">' +
                    '<div class="card-header"><h3>Nova Regra</h3></div>' +
                    '<div class="regra-form-row">' +
                        '<div class="form-group"><label>Nome da Regra</label><input class="form-control" id="regra-nome" placeholder="Ex: Promoção Inverno"></div>' +
                        '<div class="form-group"><label>Tipo</label><select class="form-control" id="regra-tipo"><option value="markup">Markup</option><option value="desconto">Desconto</option><option value="promocao">Promoção</option></select></div>' +
                        '<div class="form-group"><label>Valor (%)</label><input class="form-control" id="regra-valor" type="number" step="0.01" placeholder="10"></div>' +
                    '</div>' +
                    '<div class="regra-form-row-2">' +
                        '<div class="form-group"><label>Data Início</label><input class="form-control" id="regra-inicio" type="date"></div>' +
                        '<div class="form-group"><label>Data Fim</label><input class="form-control" id="regra-fim" type="date"></div>' +
                    '</div>' +
                    '<div class="flex-between">' +
                        '<div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:0;"><label style="margin-bottom:0;">Ativa</label><input type="checkbox" id="regra-ativa" checked></div>' +
                        '<button class="btn btn-primary" id="btn-salvar-regra"><i class="fas fa-save"></i> Salvar Regra</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    bindEvents() {
        this.container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        const btnReceitas = this.container.querySelector('#btn-prever-receitas');
        const btnDespesas = this.container.querySelector('#btn-prever-despesas');
        if (btnReceitas) btnReceitas.addEventListener('click', () => this.preverFluxo('receita'));
        if (btnDespesas) btnDespesas.addEventListener('click', () => this.preverFluxo('despesa'));

        const btnCalcPrevisao = this.container.querySelector('#btn-calcular-previsao');
        if (btnCalcPrevisao) btnCalcPrevisao.addEventListener('click', () => this.calcularPrevisaoDemanda());

        const btnCalcSugerido = this.container.querySelector('#btn-calcular-sugerido');
        if (btnCalcSugerido) btnCalcSugerido.addEventListener('click', () => this.calcularPrecoSugerido());

        const btnSalvarRegra = this.container.querySelector('#btn-salvar-regra');
        if (btnSalvarRegra) btnSalvarRegra.addEventListener('click', () => this.salvarRegra());

        const selProdPrec = this.container.querySelector('#sel-produto-precificacao');
        if (selProdPrec) selProdPrec.addEventListener('change', () => this.carregarInfoProdutoPrecificacao());
    }

    switchTab(tab) {
        this.activeTab = tab;
        this.container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        this.container.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== 'tab-' + tab));
        this.load();
    }

    async load() {
        try {
            if (this.activeTab === 'financeiro') await this.carregarFinanceiro();
            else if (this.activeTab === 'demanda') await this.carregarDemanda();
            else if (this.activeTab === 'precificacao') await this.carregarPrecificacao();
        } catch (e) {
            window.showToast('Erro ao carregar: ' + e.message, 'error');
        }
    }

    // ==================== TAB 1: Financeiro ====================

    async carregarFinanceiro() {
        try {
            const [contas, vendas, contasLista] = await Promise.all([
                window.ngr.contas.resumo(),
                window.ngr.vendas.resumo(12),
                window.ngr.contas.list().catch(() => [])
            ]);

            this.setTextoId('fin-pendentes', 'R$ ' + Number(contas.pendentes).toFixed(2));
            this.setTextoId('fin-vencendo', 'R$ ' + Number(contas.vencendo).toFixed(2));
            this.setTextoId('fin-atrasadas', 'R$ ' + Number(contas.atrasadas).toFixed(2));
            this.setTextoId('fin-pagas', 'R$ ' + Number(contas.pagas).toFixed(2));

            this.setTextoId('fin-total-vendas', 'R$ ' + Number(vendas.total).toFixed(2));
            this.setTextoId('fin-qtd-vendas', String(vendas.quantidade));
            this.setTextoId('fin-ticket-medio', 'R$ ' + Number(vendas.ticket_medio).toFixed(2));

            this.renderChartVendas(vendas.mensal);

            // Pizza: Vendas x Despesas (últimos 12 meses, mensalidades)
            const despesasPorMes = {};
            (contasLista || []).forEach(c => {
                if (c.tipo !== 'despesa' || c.status === 'cancelado' || !c.data_vencimento) return;
                const mes = String(c.data_vencimento).slice(0, 7);
                despesasPorMes[mes] = (despesasPorMes[mes] || 0) + Number(c.valor || 0);
            });
            const vendasPorMes = {};
            (vendas.mensal || []).forEach(m => { vendasPorMes[m.mes] = Number(m.total || 0); });

            const totalVendas12 = Object.values(vendasPorMes).reduce((s, v) => s + v, 0);
            const totalDespesas12 = Object.values(despesasPorMes).reduce((s, v) => s + v, 0);
            const lucro12 = Math.max(0, totalVendas12 - totalDespesas12);

            const pizzaEl = this.container.querySelector('#fin-chart-pizza');
            if (pizzaEl) {
                pizzaEl.innerHTML = pieChart([
                    { label: 'Vendas', value: Math.round(totalVendas12) },
                    { label: 'Despesas', value: Math.round(totalDespesas12) },
                    (lucro12 > 0 ? { label: 'Lucro', value: Math.round(lucro12) } : null)
                ].filter(Boolean), { totalLabel: '12 meses', formatter: v => 'R$ ' + Number(v).toLocaleString('pt-BR') });
            }

            // Escadas (Step Line): replicado do Dashboard
            const escadasEl = this.container.querySelector('#fin-chart-escadas');
            if (escadasEl) {
                const stepDados = (vendas.mensal || []).map(m => ({ label: this.formatarMes(m.mes), value: Number(m.total || 0) }));
                escadasEl.innerHTML = stepLineChart(stepDados);
            }
        } catch (e) {
            window.showToast('Erro ao carregar financeiro: ' + e.message, 'error');
        }
    }

    setTextoId(id, texto) {
        const el = this.container.querySelector('#' + id);
        if (el) el.textContent = texto;
    }

    renderChartVendas(mensal) {
        const container = this.container.querySelector('#fin-chart-vendas');
        if (!container) return;
        if (!mensal || !mensal.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sem dados de vendas</p></div>';
            return;
        }

        const max = Math.max(...mensal.map(m => Number(m.total)));
        if (max === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sem vendas registradas</p></div>';
            return;
        }

        let html = '<div class="chart-container">';
        mensal.forEach(m => {
            const pct = (Number(m.total) / max) * 100;
            const mesLabel = this.formatarMes(m.mes);
            html += '<div class="chart-col">';
            html += '<div class="chart-value">R$ ' + Number(m.total).toFixed(0) + '</div>';
            html += '<div class="chart-bar" style="height:' + pct + '%;background:var(--primary);"></div>';
            html += '<div class="chart-label">' + mesLabel + '</div>';
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async preverFluxo(tipo) {
        const tableContainer = this.container.querySelector('#fin-previsao-table');
        if (!tableContainer) return;

        tableContainer.innerHTML = '<div class="loading-screen" style="height:100px;"><i class="fas fa-spinner fa-spin"></i><p>Calculando...</p></div>';

        try {
            const resultado = await window.ngr.previsao.financeiro(tipo, 3);

            let html = '<div class="pred-tipo">' +
                '<span class="dot" style="background:' + (tipo === 'receita' ? 'var(--green)' : 'var(--red)') + ';"></span>' +
                (tipo === 'receita' ? 'Previsão de Receitas' : 'Previsão de Despesas') +
                ' — Média: R$ ' + Number(resultado.media).toFixed(2) + '</div>';

            if (resultado.previsoes && resultado.previsoes.length) {
                html += '<div class="table-wrap"><table><thead><tr><th>Período</th><th>Previsão</th></tr></thead><tbody>';
                resultado.previsoes.forEach(p => {
                    html += '<tr><td>' + p.periodo + '</td><td class="valor ' + (tipo === 'receita' ? 'positivo' : 'negativo') + '">R$ ' + Number(p.previsao).toFixed(2) + '</td></tr>';
                });
                html += '</tbody></table></div>';
            } else {
                html += '<div class="empty-state"><p>Não foi possível gerar previsões</p></div>';
            }

            tableContainer.innerHTML = html;
        } catch (e) {
            tableContainer.innerHTML = '<div class="empty-state"><p>Erro ao calcular: ' + e.message + '</p></div>';
        }
    }

    // ==================== TAB 2: Previsão de Demanda ====================

    async carregarDemanda() {
        try {
            const produtos = await window.ngr.produtos.list({ ativo: 1 });
            this.produtos = produtos;
            const select = this.container.querySelector('#sel-produto-demanda');
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">Selecione um produto</option>' +
                produtos.map(p => '<option value="' + p.id + '">' + (p.nome || p.descricao || 'Produto #' + p.id) + '</option>').join('');
            if (currentVal) select.value = currentVal;
        } catch (e) {
            window.showToast('Erro ao carregar produtos: ' + e.message, 'error');
        }
    }

    async calcularPrevisaoDemanda() {
        const select = this.container.querySelector('#sel-produto-demanda');
        const resultsContainer = this.container.querySelector('#demanda-results');
        if (!select || !resultsContainer) return;

        const produtoId = parseInt(select.value);
        if (!produtoId) {
            window.showToast('Selecione um produto', 'error');
            return;
        }

        resultsContainer.innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i><p>Calculando previsão...</p></div>';

        try {
            const resultado = await window.ngr.previsao.demanda(produtoId, 3);
            this.renderPrevisaoDemanda(resultado, resultsContainer);
        } catch (e) {
            resultsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro: ' + e.message + '</p></div>';
        }
    }

    renderPrevisaoDemanda(resultado, container) {
        const historico = resultado.historico || [];
        const previsoes = resultado.previsoes || [];

        let html = '<div class="grid-2 mb-2">';

        html += '<div class="card"><div class="card-header"><h3>Histórico de Vendas</h3></div>';
        if (historico.length) {
            html += '<div class="table-wrap"><table><thead><tr><th>Mês</th><th>Quantidade</th></tr></thead><tbody>';
            historico.forEach(h => {
                html += '<tr><td>' + this.formatarMesAno(h.mes) + '</td><td>' + h.qtd + '</td></tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<div class="empty-state"><p>Sem histórico disponível</p></div>';
        }
        html += '</div>';

        html += '<div class="card"><div class="card-header"><h3>Previsão para os Próximos Meses</h3></div>';
        if (previsoes.length) {
            html += '<div class="table-wrap"><table><thead><tr><th>Período</th><th>Previsão</th></tr></thead><tbody>';
            previsoes.forEach(p => {
                html += '<tr><td>' + p.periodo + '</td><td>' + p.previsao + '</td></tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<div class="empty-state"><p>Não foi possível gerar previsões</p></div>';
        }
        html += '</div>';

        html += '</div>';

        html += '<div class="grid-3 mb-2">';
        html += '<div class="stat-card primary"><i class="fas fa-calculator stat-icon"></i><div class="stat-label">Média Simples</div><div class="stat-value">' + (resultado.media != null ? Number(resultado.media).toFixed(1) : '-') + '</div></div>';
        html += '<div class="stat-card warning"><i class="fas fa-weight-hanging stat-icon"></i><div class="stat-label">Média Ponderada</div><div class="stat-value">' + (resultado.media_ponderada != null ? Number(resultado.media_ponderada).toFixed(1) : '-') + '</div></div>';
        const valorFinal = resultado.media_ponderada != null ? resultado.media_ponderada : (resultado.media || 0);
        html += '<div class="stat-card success"><i class="fas fa-check-circle stat-icon"></i><div class="stat-label">Previsão Final</div><div class="stat-value">' + Number(valorFinal).toFixed(1) + '</div></div>';
        html += '</div>';

        html += '<div class="card">';
        html += '<div class="card-header"><h3>Comparativo: Histórico vs Previsão</h3></div>';

        const todosDados = [];
        historico.forEach(h => {
            todosDados.push({ label: this.formatarMes(h.mes), valor: Number(h.qtd), tipo: 'hist' });
        });
        previsoes.forEach(p => {
            todosDados.push({ label: this.abreviarPeriodo(p.periodo), valor: Number(p.previsao), tipo: 'prev' });
        });

        if (todosDados.length) {
            const maxVal = Math.max(...todosDados.map(d => d.valor));
            if (maxVal > 0) {
                html += '<div class="chart-container">';
                todosDados.forEach(d => {
                    const pct = (d.valor / maxVal) * 100;
                    const cor = d.tipo === 'hist' ? 'var(--primary)' : 'var(--blue)';
                    html += '<div class="chart-col">';
                    html += '<div class="chart-value">' + d.valor + '</div>';
                    html += '<div class="chart-bar" style="height:' + pct + '%;background:' + cor + ';"></div>';
                    html += '<div class="chart-label">' + d.label + '</div>';
                    html += '</div>';
                });
                html += '</div>';
                html += '<div class="pred-tipo" style="justify-content:center;margin-top:8px;">' +
                    '<span class="dot" style="background:var(--primary);"></span> Histórico ' +
                    '<span class="dot" style="background:var(--blue);margin-left:12px;"></span> Previsão' +
                    '</div>';
            } else {
                html += '<div class="empty-state"><p>Sem dados para exibir</p></div>';
            }
        } else {
            html += '<div class="empty-state"><p>Sem dados para exibir</p></div>';
        }

        html += '</div>';

        container.innerHTML = html;
    }

    // ==================== TAB 3: Precificação Dinâmica ====================

    async carregarPrecificacao() {
        try {
            const produtos = await window.ngr.produtos.list({ ativo: 1 });
            this.produtos = produtos;
            const select = this.container.querySelector('#sel-produto-precificacao');
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">Selecione um produto</option>' +
                produtos.map(p => '<option value="' + p.id + '">' + (p.nome || p.descricao || 'Produto #' + p.id) + '</option>').join('');
            if (currentVal) select.value = currentVal;

            if (select.value) {
                await this.carregarInfoProdutoPrecificacao();
            } else {
                const infoContainer = this.container.querySelector('#precificacao-info');
                if (infoContainer) infoContainer.innerHTML = '<div class="empty-state"><i class="fas fa-box"></i><p>Selecione um produto</p></div>';
                this.carregarRegras(null);
            }
        } catch (e) {
            window.showToast('Erro ao carregar produtos: ' + e.message, 'error');
        }
    }

    async carregarInfoProdutoPrecificacao() {
        const select = this.container.querySelector('#sel-produto-precificacao');
        const infoContainer = this.container.querySelector('#precificacao-info');
        if (!select || !infoContainer) return;

        const produtoId = parseInt(select.value);
        if (!produtoId) {
            infoContainer.innerHTML = '<div class="empty-state"><i class="fas fa-box"></i><p>Selecione um produto</p></div>';
            this.carregarRegras(null);
            return;
        }

        infoContainer.innerHTML = '<div class="loading-screen" style="height:100px;"><i class="fas fa-spinner fa-spin"></i><p>Carregando...</p></div>';

        try {
            const produto = await window.ngr.produtos.get(produtoId);
            infoContainer.innerHTML =
                '<div class="grid-3">' +
                    '<div class="stat-card"><i class="fas fa-dollar-sign stat-icon"></i><div class="stat-label">Custo</div><div class="stat-value">R$ ' + Number(produto.custo || 0).toFixed(2) + '</div></div>' +
                    '<div class="stat-card primary"><i class="fas fa-tag stat-icon"></i><div class="stat-label">Preço Atual</div><div class="stat-value">R$ ' + Number(produto.preco || produto.preco_venda || 0).toFixed(2) + '</div></div>' +
                    '<div class="stat-card" id="sugerido-card"><i class="fas fa-star stat-icon"></i><div class="stat-label">Preço Sugerido</div><div class="stat-value" id="sugerido-valor">-</div></div>' +
                '</div>';

            await this.carregarRegras(produtoId);
        } catch (e) {
            infoContainer.innerHTML = '<div class="empty-state"><p>Erro ao carregar produto: ' + e.message + '</p></div>';
        }
    }

    async carregarRegras(produtoId) {
        const tbody = this.container.querySelector('#regras-tbody');
        const empty = this.container.querySelector('#regras-empty');
        if (!tbody || !empty) return;

        if (!produtoId) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        try {
            const regras = await window.ngr.precificacao.list(produtoId);
            if (!regras || !regras.length) {
                tbody.innerHTML = '';
                empty.classList.remove('hidden');
                return;
            }

            empty.classList.add('hidden');
            tbody.innerHTML = regras.map(r => {
                const tipoLabel = r.tipo === 'markup' ? 'Markup' : r.tipo === 'desconto' ? 'Desconto' : r.tipo === 'promocao' ? 'Promoção' : r.tipo;
                const periodo = (r.data_inicio || '') + (r.data_inicio && r.data_fim ? ' até ' : '') + (r.data_fim || '');
                return '<tr>' +
                    '<td>' + (r.nome_regra || r.nome || 'Regra #' + r.id) + '</td>' +
                    '<td><span class="status-badge ' + r.tipo + '">' + tipoLabel + '</span></td>' +
                    '<td>' + Number(r.valor).toFixed(1) + '%</td>' +
                    '<td>' + (periodo || '-') + '</td>' +
                    '<td><span class="status-badge ' + (r.ativo ? 'ativo' : 'arquivado') + '">' + (r.ativo ? 'Ativa' : 'Inativa') + '</span></td>' +
                    window.actMenu([
                        window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-regra', attrs: 'data-id="' + r.id + '"' }),
                    ]) +
                    '</tr>';
            }).join('');

            tbody.querySelectorAll('.btn-excluir-regra').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await window.ngr.precificacao.remove(Number(btn.dataset.id));
                        window.showToast('Regra removida', 'info');
                        const sel = this.container.querySelector('#sel-produto-precificacao');
                        if (sel) await this.carregarRegras(parseInt(sel.value));
                    } catch (e) {
                        window.showToast('Erro ao remover: ' + e.message, 'error');
                    }
                });
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--red);">Erro: ' + e.message + '</td></tr>';
            empty.classList.add('hidden');
        }
    }

    async calcularPrecoSugerido() {
        const select = this.container.querySelector('#sel-produto-precificacao');
        if (!select) return;

        const produtoId = parseInt(select.value);
        if (!produtoId) {
            window.showToast('Selecione um produto', 'error');
            return;
        }

        try {
            const produto = await window.ngr.produtos.get(produtoId);
            const precoSugerido = await window.ngr.precificacao.calcular(produto);

            const sugeridoEl = this.container.querySelector('#sugerido-valor');
            const sugeridoCard = this.container.querySelector('#sugerido-card');
            if (sugeridoEl) sugeridoEl.textContent = 'R$ ' + Number(precoSugerido).toFixed(2);
            if (sugeridoCard) sugeridoCard.style.borderLeftColor = 'var(--green)';

            window.showToast('Preço sugerido: R$ ' + Number(precoSugerido).toFixed(2), 'success');
        } catch (e) {
            window.showToast('Erro ao calcular: ' + e.message, 'error');
        }
    }

    async salvarRegra() {
        const select = this.container.querySelector('#sel-produto-precificacao');
        if (!select) return;

        const produtoId = parseInt(select.value);
        if (!produtoId) {
            window.showToast('Selecione um produto primeiro', 'error');
            return;
        }

        const nome = this.container.querySelector('#regra-nome').value.trim();
        const tipo = this.container.querySelector('#regra-tipo').value;
        const valor = parseFloat(this.container.querySelector('#regra-valor').value);
        const dataInicio = this.container.querySelector('#regra-inicio').value || null;
        const dataFim = this.container.querySelector('#regra-fim').value || null;
        const ativa = this.container.querySelector('#regra-ativa').checked;

        if (!nome) { window.showToast('Informe o nome da regra', 'error'); return; }
        if (!valor || isNaN(valor)) { window.showToast('Informe um valor válido', 'error'); return; }

        try {
            await window.ngr.precificacao.create({
                produto_id: produtoId,
                nome_regra: nome,
                tipo: tipo,
                valor: valor,
                ativo: ativa,
                data_inicio: dataInicio,
                data_fim: dataFim
            });

            window.showToast('Regra cadastrada com sucesso', 'success');

            const nomeInput = this.container.querySelector('#regra-nome');
            const valorInput = this.container.querySelector('#regra-valor');
            const inicioInput = this.container.querySelector('#regra-inicio');
            const fimInput = this.container.querySelector('#regra-fim');
            const ativaCheck = this.container.querySelector('#regra-ativa');
            if (nomeInput) nomeInput.value = '';
            if (valorInput) valorInput.value = '';
            if (inicioInput) inicioInput.value = '';
            if (fimInput) fimInput.value = '';
            if (ativaCheck) ativaCheck.checked = true;

            await this.carregarRegras(produtoId);
        } catch (e) {
            window.showToast('Erro ao salvar: ' + e.message, 'error');
        }
    }

    // ==================== Helpers ====================

    formatarMes(mes) {
        if (typeof mes === 'string' && mes.includes('-')) {
            const parts = mes.split('-');
            const idx = parseInt(parts[1]) - 1;
            return MESES[idx] || mes;
        }
        if (typeof mes === 'number') return MESES[mes - 1] || String(mes);
        return mes;
    }

    formatarMesAno(mes) {
        if (typeof mes === 'string' && mes.includes('-')) {
            const parts = mes.split('-');
            const idx = parseInt(parts[1]) - 1;
            return (MESES[idx] || parts[1]) + '/' + parts[0];
        }
        return mes;
    }

    abreviarPeriodo(periodo) {
        if (typeof periodo === 'string' && periodo.includes('-')) {
            const parts = periodo.split('-');
            const idx = parseInt(parts[1]) - 1;
            return MESES[idx] || periodo;
        }
        return periodo;
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

export default Relatorios;
