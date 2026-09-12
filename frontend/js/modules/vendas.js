class Vendas {
    constructor(container) {
        this.container = container;
        this.filtro = { status: '', data_inicio: '', data_fim: '' };
        this.saleItems = [];
        this.editId = null;
        this.selectedClientId = null;
        this.selectedClientName = '';
        this._outsideClick = null;
    }

    async init() {
        this.destroy();
        this.render();
        await this.load();
    }

    async load() {
        const [data, resumo] = await Promise.all([
            window.ngr.vendas.list(Object.fromEntries(Object.entries(this.filtro).filter(([, v]) => v))),
            window.ngr.vendas.resumo(1)
        ]);
        this.renderResumo(resumo);
        this.renderTable(data);
    }

    renderResumo(r) {
        const cards = document.getElementById('resumo-cards');
        if (!cards) return;
        cards.innerHTML = `
            <div class="stat-card primary">
                <i class="fas fa-shopping-cart stat-icon"></i>
                <div class="stat-label">Vendas este Mes</div>
                <div class="stat-value">${Number(r.quantidade ?? r.total_vendas ?? 0)}</div>
            </div>
            <div class="stat-card success">
                <i class="fas fa-dollar-sign stat-icon"></i>
                <div class="stat-label">Faturamento</div>
                <div class="stat-value valor positivo">R$ ${Number(r.total_valor ?? 0).toFixed(2)}</div>
            </div>
            <div class="stat-card warning">
                <i class="fas fa-receipt stat-icon"></i>
                <div class="stat-label">Ticket Medio</div>
                <div class="stat-value">R$ ${Number(r.media_ticket ?? 0).toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-check-circle stat-icon" style="opacity:.3;color:var(--primary)"></i>
                <div class="stat-label">Finalizadas</div>
                <div class="stat-value">${Number(r.finalizadas ?? 0)}</div>
            </div>
        `;
    }

    renderTable(data) {
        const tbody = document.getElementById('vendas-tbody');
        const empty = document.getElementById('vendas-empty');
        if (!data || !data.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.map(v => `<tr class="venda-row" data-id="${v.id}">
            <td>${v.id}</td>
            <td class="truncate" title="${v.cliente_nome || ''}">${v.cliente_nome || '-'}</td>
            <td>${v.data}</td>
            <td class="valor">R$ ${Number(v.total_final ?? v.total ?? 0).toFixed(2)}</td>
            <td><span class="status-badge ${v.status}">${v.status}</span></td>
            ${window.actMenu([
                ...(v.status === 'rascunho' || v.status === 'pendente' ? [window.actItem({ icon: 'fa-check', label: 'Finalizar', cls: 'btn-finalizar-venda', attrs: 'data-id="' + v.id + '"' })] : []),
                window.actItem({ icon: 'fa-print', label: 'Imprimir recibo', cls: 'btn-imprimir-venda', attrs: 'data-id="' + v.id + '"' }),
                window.actItem({ icon: 'fa-file-pdf', label: 'Emitir NFe (DANFE)', cls: 'btn-nfe-venda', attrs: 'data-id="' + v.id + '"' }),
                ...(v.status !== 'cancelada' ? [window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-venda', attrs: 'data-id="' + v.id + '"' })] : []),
            ])}
        </tr>`).join('');

        tbody.querySelectorAll('.venda-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.openDetail(Number(row.dataset.id));
            });
        });
        tbody.querySelectorAll('.btn-finalizar-venda').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.finalizarVenda(Number(btn.dataset.id));
            });
        });
        tbody.querySelectorAll('.btn-excluir-venda').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.excluirVenda(Number(btn.dataset.id));
            });
        });
        tbody.querySelectorAll('.btn-imprimir-venda').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.imprimirRecibo(Number(btn.dataset.id));
            });
        });
        tbody.querySelectorAll('.btn-nfe-venda').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emitirNFe(Number(btn.dataset.id));
            });
        });
    }

    async imprimirRecibo(id) {
        try {
            const venda = await window.ngr.vendas.get(id);
            const itens = await window.ngr.vendas.itens(id);
            if (!venda) { window.showToast('Venda não encontrada', 'error'); return; }
            const linhas = (itens || []).map(i =>
                `<tr><td>${this.escHtml(i.produto_nome || 'Produto #' + i.produto_id)}</td><td>${i.quantidade}</td><td>R$ ${Number(i.preco_unitario).toFixed(2)}</td><td>R$ ${Number(i.preco_total).toFixed(2)}</td></tr>`
            ).join('');
            const html = `
                <h2 style="text-align:center">NGR HUB</h2>
                <p style="text-align:center;font-size:11px">Recibo de Venda #${venda.id}</p>
                <p style="font-size:12px"><strong>Cliente:</strong> ${this.escHtml(venda.cliente_nome || '-')}</p>
                <p style="font-size:12px"><strong>Data:</strong> ${venda.data}</p>
                <table>
                    <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
                    <tbody>${linhas || '<tr><td colspan="4">Sem itens</td></tr>'}</tbody>
                    <tfoot>
                        <tr><td colspan="3" style="text-align:right"><strong>Total Final:</strong></td><td><strong>R$ ${Number(venda.total_final ?? venda.total ?? 0).toFixed(2)}</strong></td></tr>
                        ${venda.forma_pagamento ? `<tr><td colspan="4" style="text-align:right">Pagamento: ${this.escHtml(venda.forma_pagamento)}</td></tr>` : ''}
                    </tfoot>
                </table>
            `;
            const res = await window.ngr.print.html(html, {});
            if (res && res.success) window.showToast('Enviado para impressão', 'success');
            else window.showToast('Impressão: ' + (res?.error || 'cancelada'), 'error');
        } catch (e) {
            window.showToast('Erro ao imprimir: ' + e.message, 'error');
        }
    }

    async emitirNFe(id) {
        try {
            const res = await window.ngr.nfe.emitir(id);
            if (res && res.success) {
                window.showToast('NFe emitida — DANFE gerado', 'success');
                const imprimir = confirm('DANFE gerado com sucesso. Deseja imprimir agora?');
                if (imprimir && res.pdfBase64) {
                    await window.ngr.print.pdf('data:application/pdf;base64,' + res.pdfBase64, {});
                }
            } else {
                window.showToast('NFe: ' + (res?.error || 'erro ao emitir'), 'error');
            }
        } catch (e) {
            window.showToast('Erro ao emitir NFe: ' + e.message, 'error');
        }
    }

    escHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    render() {
        const hoje = new Date().toISOString().split('T')[0];
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div class="page-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                    <div class="filter-bar" style="margin-bottom:0">
                        <input class="form-control" type="date" id="filtro-data-inicio">
                        <input class="form-control" type="date" id="filtro-data-fim">
                        <select class="form-control" id="filtro-status">
                            <option value="">Todos os status</option>
                            <option value="rascunho">Rascunho</option>
                            <option value="finalizada">Finalizada</option>
                            <option value="cancelada">Cancelada</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="btn-nova-venda"><i class="fas fa-plus"></i> Nova Venda</button>
                </div>
            </div>
            <div class="grid-4 mb-2" id="resumo-cards"></div>
            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>#</th><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th><th>Acoes</th></tr></thead>
                    <tbody id="vendas-tbody"></tbody>
                </table></div>
                <div id="vendas-empty" class="empty-state hidden"><i class="fas fa-inbox"></i><p>Nenhuma venda encontrada</p></div>
            </div>
            <!-- Modal Nova Venda -->
            <div id="venda-modal" class="modal-overlay hidden">
                <div class="modal" style="max-width:720px">
                    <div class="flex-between" style="margin-bottom:16px"><h3 id="venda-modal-title">Nova Venda</h3></div>
                    <div class="form-group">
                        <label>Cliente</label>
                        <div id="venda-cliente-area" style="position:relative">
                            <div id="venda-cliente-search-box">
                                <input class="form-control" id="venda-cliente-search" placeholder="Buscar cliente por nome..." autocomplete="off">
                                <div id="venda-cliente-dropdown" class="search-dropdown hidden"></div>
                            </div>
                            <div id="venda-cliente-selected" class="hidden" style="display:none;align-items:center;gap:8px;padding:6px 0">
                                <i class="fas fa-user" style="color:var(--primary)"></i>
                                <span id="venda-cliente-name" style="font-weight:600"></span>
                                <button class="btn btn-sm btn-ghost" id="venda-cliente-clear" type="button">Trocar</button>
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Data da Venda</label>
                        <input class="form-control" id="venda-data" type="date" value="${hoje}">
                    </div>
                    <div class="form-group">
                        <label>Itens</label>
                        <div id="venda-items-area">
                            <div class="table-wrap"><table>
                                <thead><tr><th style="min-width:140px">Produto</th><th style="width:70px">Qtd</th><th style="width:110px">Preco Unit.</th><th style="width:100px">Subtotal</th><th style="width:40px"></th></tr></thead>
                                <tbody id="venda-items-tbody-modal"></tbody>
                            </table></div>
                            <div id="venda-items-empty" class="empty-state" style="padding:8px"><i class="fas fa-box-open"></i><p>Nenhum item adicionado</p></div>
                        </div>
                        <div class="mt-2" id="venda-add-item-area">
                            <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
                                <div style="flex:2;min-width:180px">
                                    <label style="font-size:.75rem;color:var(--text2);margin-bottom:2px;display:block">Produto</label>
                                    <div style="position:relative" id="produto-search-box">
                                        <input class="form-control" id="venda-item-produto-search" placeholder="Buscar produto..." autocomplete="off">
                                        <div id="venda-item-produto-dropdown" class="search-dropdown hidden"></div>
                                    </div>
                                </div>
                                <div style="flex:0 0 70px">
                                    <label style="font-size:.75rem;color:var(--text2);margin-bottom:2px;display:block">Qtd</label>
                                    <input class="form-control" id="venda-item-qtd" type="number" value="1" min="0.01" step="1">
                                </div>
                                <div style="flex:0 0 110px">
                                    <label style="font-size:.75rem;color:var(--text2);margin-bottom:2px;display:block">Preco Unit. (R$)</label>
                                    <input class="form-control" id="venda-item-preco" type="number" step="0.01" min="0" placeholder="0,00">
                                </div>
                                <button class="btn btn-primary btn-sm" id="venda-item-add" type="button" style="margin-bottom:0"><i class="fas fa-plus"></i> Adicionar</button>
                            </div>
                        </div>
                    </div>
                    <div class="grid-3" style="margin-top:8px">
                        <div class="form-group">
                            <label>Total Produtos</label>
                            <input class="form-control" id="venda-total-produtos" readonly style="font-weight:700">
                        </div>
                        <div class="form-group">
                            <label>Desconto (R$)</label>
                            <input class="form-control" id="venda-desconto" type="number" step="0.01" value="0" min="0">
                        </div>
                        <div class="form-group">
                            <label>Total Final</label>
                            <input class="form-control" id="venda-total-final" readonly style="font-weight:700;color:var(--primary)">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Forma de Pagamento</label>
                        <select class="form-control" id="venda-pagamento">
                            <option value="">Selecionar</option>
                            <option value="dinheiro">Dinheiro</option>
                            <option value="credito">Cartao de Credito</option>
                            <option value="debito">Cartao de Debito</option>
                            <option value="pix">Pix</option>
                            <option value="boleto">Boleto</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="outro">Outro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Observacao</label>
                        <textarea class="form-control" id="venda-obs" rows="2" placeholder="Observacoes sobre a venda..."></textarea>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="venda-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="venda-save"><i class="fas fa-save"></i> Salvar Venda</button>
                    </div>
                </div>
            </div>
            <!-- Modal Detalhe Venda -->
            <div id="venda-detail-modal" class="modal-overlay hidden">
                <div class="modal" style="max-width:620px">
                    <div class="flex-between" style="margin-bottom:16px">
                        <h3>Venda #<span id="venda-detail-id"></span></h3>
                        <span id="venda-detail-status"></span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:.9rem">
                        <div><span style="color:var(--text2)">Cliente:</span> <span id="venda-detail-cliente" style="font-weight:600"></span></div>
                        <div><span style="color:var(--text2)">Data:</span> <span id="venda-detail-data"></span></div>
                        <div><span style="color:var(--text2)">Total:</span> <span id="venda-detail-total" style="font-weight:700;color:var(--primary)"></span></div>
                        <div><span style="color:var(--text2)">Pagamento:</span> <span id="venda-detail-pagamento"></span></div>
                    </div>
                    <div id="venda-detail-obs" style="margin-bottom:12px;font-size:.85rem;padding:8px 12px;background:var(--bg3);border-radius:var(--radius-sm);display:none"></div>
                    <h4 style="font-size:.85rem;margin-bottom:8px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Itens</h4>
                    <div class="table-wrap"><table>
                        <thead><tr><th>Produto</th><th>Qtd</th><th>Preco Unit.</th><th>Subtotal</th></tr></thead>
                        <tbody id="venda-detail-items-tbody"></tbody>
                        <tfoot id="venda-detail-items-tfoot"></tfoot>
                    </table></div>
                    <div id="venda-detail-finalizar-area" class="modal-actions" style="margin-top:16px">
                        <button class="btn btn-ghost" id="venda-detail-close">Fechar</button>
                        <button class="btn btn-success" id="venda-detail-finalizar"><i class="fas fa-check"></i> Finalizar Venda</button>
                    </div>
                    <div class="modal-actions" id="venda-detail-excluir-area" style="margin-top:0;display:none">
                        <button class="btn btn-danger btn-sm" id="venda-detail-excluir"><i class="fas fa-trash"></i> Excluir Venda</button>
                    </div>
                </div>
            </div>
            <style>
                .search-dropdown {
                    position:absolute;top:100%;left:0;right:0;z-index:50;
                    background:var(--surface);border:1px solid var(--border);
                    border-radius:var(--radius-sm);max-height:200px;overflow-y:auto;
                    box-shadow:0 4px 20px rgba(0,0,0,.4);
                }
                .search-dropdown:not(.hidden) { display:block; }
                .search-dropdown-item {
                    padding:8px 12px;cursor:pointer;font-size:.85rem;
                    border-bottom:1px solid var(--border);transition:background .2s;
                }
                .search-dropdown-item:last-child { border-bottom:none; }
                .search-dropdown-item:hover { background:var(--bg3); }
                .search-dropdown-item .item-sub {
                    font-size:.75rem;color:var(--text2);margin-top:1px;
                }
                .search-dropdown-empty {
                    padding:12px;text-align:center;color:var(--text2);font-size:.8rem;
                }
                #venda-modal .modal { max-height:90vh; }
                .venda-row { cursor:pointer; }
                .venda-row:hover td { background:var(--bg3); }
                .item-row td { vertical-align:middle; }
                .item-row .btn-remove-item {
                    background:none;border:none;color:var(--red);cursor:pointer;
                    padding:4px 8px;border-radius:4px;transition:background .2s;
                }
                .item-row .btn-remove-item:hover { background:var(--bg3); }
            </style>
        `;

        document.getElementById('filtro-status').addEventListener('change', (e) => {
            this.filtro.status = e.target.value || undefined;
            this.load();
        });
        document.getElementById('filtro-data-inicio').addEventListener('change', (e) => {
            this.filtro.data_inicio = e.target.value || undefined;
            this.load();
        });
        document.getElementById('filtro-data-fim').addEventListener('change', (e) => {
            this.filtro.data_fim = e.target.value || undefined;
            this.load();
        });
        document.getElementById('btn-nova-venda').addEventListener('click', () => this.openNewSaleForm());

        document.getElementById('venda-cancel').addEventListener('click', () => this.closeForm());

        document.getElementById('venda-save').addEventListener('click', () => this.save());

        let clientSearchTimer;
        document.getElementById('venda-cliente-search').addEventListener('input', (e) => {
            clearTimeout(clientSearchTimer);
            clientSearchTimer = setTimeout(() => this.searchClient(e.target.value), 250);
        });
        document.getElementById('venda-cliente-search').addEventListener('focus', (e) => {
            if (!this.selectedClientId && e.target.value) this.searchClient(e.target.value);
        });
        document.getElementById('venda-cliente-clear').addEventListener('click', () => this.clearClientSelection());

        let prodSearchTimer;
        document.getElementById('venda-item-produto-search').addEventListener('input', (e) => {
            clearTimeout(prodSearchTimer);
            prodSearchTimer = setTimeout(() => this.searchProduct(e.target.value), 250);
        });
        document.getElementById('venda-item-produto-search').addEventListener('focus', (e) => {
            if (e.target.value) this.searchProduct(e.target.value);
        });
        document.getElementById('venda-item-add').addEventListener('click', () => this.addItem());
        document.getElementById('venda-item-qtd').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addItem(); });
        document.getElementById('venda-item-preco').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addItem(); });

        document.getElementById('venda-desconto').addEventListener('input', () => this.updateTotals());

        document.getElementById('venda-detail-close').addEventListener('click', () => this.closeDetail());
        document.getElementById('venda-detail-finalizar').addEventListener('click', () => {
            const id = Number(document.getElementById('venda-detail-id').textContent);
            this.finalizarVenda(id);
        });
        document.getElementById('venda-detail-excluir').addEventListener('click', () => {
            const id = Number(document.getElementById('venda-detail-id').textContent);
            this.closeDetail();
            this.excluirVenda(id);
        });

        this._outsideClick = (e) => {
            const clientArea = document.getElementById('venda-cliente-area');
            if (clientArea && !clientArea.contains(e.target)) {
                const dd1 = document.getElementById('venda-cliente-dropdown');
                if (dd1) dd1.classList.add('hidden');
            }
            const prodArea = document.getElementById('produto-search-box');
            if (prodArea && !prodArea.contains(e.target)) {
                const dd2 = document.getElementById('venda-item-produto-dropdown');
                if (dd2) dd2.classList.add('hidden');
            }
        };
        document.addEventListener('click', this._outsideClick);
    }

    async searchClient(q) {
        const dd = document.getElementById('venda-cliente-dropdown');
        if (!q || q.length < 1) { dd.classList.add('hidden'); return; }
        try {
            const res = await window.ngr.clientes.list({ nome: q });
            if (!res.length) {
                dd.innerHTML = '<div class="search-dropdown-empty">Nenhum cliente encontrado</div>';
                dd.classList.remove('hidden');
                return;
            }
            dd.innerHTML = res.map(c => `<div class="search-dropdown-item" data-id="${c.id}" data-nome="${c.nome}">
                <div>${c.nome}</div>
                ${c.email ? `<div class="item-sub">${c.email}</div>` : ''}
            </div>`).join('');
            dd.classList.remove('hidden');
            dd.querySelectorAll('.search-dropdown-item').forEach(el => {
                el.addEventListener('click', () => {
                    this.selectedClientId = Number(el.dataset.id);
                    this.selectedClientName = el.dataset.nome;
                    document.getElementById('venda-cliente-search-box').style.display = 'none';
                    document.getElementById('venda-cliente-selected').style.display = 'flex';
                    document.getElementById('venda-cliente-selected').classList.remove('hidden');
                    document.getElementById('venda-cliente-name').textContent = this.selectedClientName;
                    dd.classList.add('hidden');
                });
            });
        } catch (e) {
            console.error('Erro ao buscar clientes:', e);
        }
    }

    clearClientSelection() {
        this.selectedClientId = null;
        this.selectedClientName = '';
        document.getElementById('venda-cliente-search-box').style.display = 'block';
        document.getElementById('venda-cliente-selected').style.display = 'none';
        document.getElementById('venda-cliente-selected').classList.add('hidden');
        document.getElementById('venda-cliente-search').value = '';
    }

    async searchProduct(q) {
        const dd = document.getElementById('venda-item-produto-dropdown');
        if (!q || q.length < 1) { dd.classList.add('hidden'); return; }
        try {
            const res = await window.ngr.produtos.list({ nome: q });
            if (!res.length) {
                dd.innerHTML = '<div class="search-dropdown-empty">Nenhum produto encontrado</div>';
                dd.classList.remove('hidden');
                return;
            }
            dd.innerHTML = res.map(p => `<div class="search-dropdown-item" data-id="${p.id}" data-nome="${p.nome}" data-preco="${p.preco_venda ?? p.preco ?? 0}">
                <div>${p.nome}</div>
                <div class="item-sub">R$ ${Number(p.preco_venda ?? p.preco ?? 0).toFixed(2)} ${p.estoque !== undefined ? '| Estoque: ' + p.estoque : ''}</div>
            </div>`).join('');
            dd.classList.remove('hidden');
            dd.querySelectorAll('.search-dropdown-item').forEach(el => {
                el.addEventListener('click', () => {
                    document.getElementById('venda-item-produto-search').value = el.dataset.nome;
                    document.getElementById('venda-item-produto-search').dataset.produtoId = el.dataset.id;
                    document.getElementById('venda-item-preco').value = Number(el.dataset.preco).toFixed(2);
                    dd.classList.add('hidden');
                    document.getElementById('venda-item-qtd').focus();
                });
            });
        } catch (e) {
            console.error('Erro ao buscar produtos:', e);
        }
    }

    addItem() {
        const searchInput = document.getElementById('venda-item-produto-search');
        const qtdInput = document.getElementById('venda-item-qtd');
        const precoInput = document.getElementById('venda-item-preco');
        const produtoId = parseInt(searchInput.dataset.produtoId);
        const nome = searchInput.value.trim();
        const qtd = parseFloat(qtdInput.value);
        const preco = parseFloat(precoInput.value);

        if (!produtoId || !nome) { window.showToast('Selecione um produto', 'error'); return; }
        if (!qtd || qtd <= 0) { window.showToast('Informe uma quantidade valida', 'error'); return; }
        if (!preco || preco < 0) { window.showToast('Informe um preco valido', 'error'); return; }

        this.saleItems.push({ produto_id: produtoId, produto_nome: nome, qtd, preco, subtotal: qtd * preco });

        searchInput.value = '';
        searchInput.dataset.produtoId = '';
        qtdInput.value = '1';
        precoInput.value = '';

        this.renderItems();
        this.updateTotals();
        searchInput.focus();
    }

    removeItem(index) {
        this.saleItems.splice(index, 1);
        this.renderItems();
        this.updateTotals();
    }

    renderItems() {
        const tbody = document.getElementById('venda-items-tbody-modal');
        const empty = document.getElementById('venda-items-empty');
        if (!this.saleItems.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = this.saleItems.map((item, i) => `<tr class="item-row" data-index="${i}">
            <td>${item.produto_nome}</td>
            <td>${item.qtd}</td>
            <td>R$ ${item.preco.toFixed(2)}</td>
            <td class="valor">R$ ${item.subtotal.toFixed(2)}</td>
            <td><button class="btn-remove-item" data-index="${i}" title="Remover"><i class="fas fa-times"></i></button></td>
        </tr>`).join('');

        tbody.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeItem(Number(btn.dataset.index));
            });
        });
    }

    updateTotals() {
        const totalProdutos = this.saleItems.reduce((s, i) => s + i.subtotal, 0);
        const desconto = parseFloat(document.getElementById('venda-desconto').value) || 0;
        const totalFinal = Math.max(0, totalProdutos - desconto);
        document.getElementById('venda-total-produtos').value = 'R$ ' + totalProdutos.toFixed(2);
        document.getElementById('venda-total-final').value = 'R$ ' + totalFinal.toFixed(2);
    }

    openNewSaleForm() {
        this.editId = null;
        this.saleItems = [];
        this.selectedClientId = null;
        this.selectedClientName = '';

        document.getElementById('venda-modal-title').textContent = 'Nova Venda';
        document.getElementById('venda-modal').classList.remove('hidden');
        document.getElementById('venda-data').value = new Date().toISOString().split('T')[0];
        document.getElementById('venda-desconto').value = '0';
        document.getElementById('venda-obs').value = '';
        document.getElementById('venda-pagamento').value = '';

        this.clearClientSelection();
        this.renderItems();
        this.updateTotals();

        document.getElementById('venda-cliente-search').focus();
    }

    closeForm() {
        document.getElementById('venda-modal').classList.add('hidden');
        this.editId = null;
        this.saleItems = [];
    }

    async save() {
        const clienteId = this.selectedClientId;
        const data = document.getElementById('venda-data').value;
        const desconto = parseFloat(document.getElementById('venda-desconto').value) || 0;
        const observacao = document.getElementById('venda-obs').value.trim() || null;
        const pagamento = document.getElementById('venda-pagamento').value;

        if (!clienteId) { window.showToast('Selecione um cliente', 'error'); return; }
        if (!data) { window.showToast('Informe a data da venda', 'error'); return; }
        if (!this.saleItems.length) { window.showToast('Adicione ao menos um item a venda', 'error'); return; }

        const totalProdutos = this.saleItems.reduce((s, i) => s + i.subtotal, 0);
        const totalFinal = Math.max(0, totalProdutos - desconto);

        const dados = {
            cliente_id: clienteId,
            data,
            total_produtos: totalProdutos,
            total_desconto: desconto,
            total_final: totalFinal,
            status: 'rascunho',
            forma_pagamento: pagamento || null,
            observacao
        };

        let vendaId;
        try {
            if (this.editId) {
                await window.ngr.vendas.update(this.editId, dados);
                vendaId = this.editId;
            } else {
                const result = await window.ngr.vendas.create(dados);
                vendaId = result.id ?? result;
            }

            for (const item of this.saleItems) {
                await window.ngr.vendas.addItem(vendaId, item.produto_id, item.qtd, item.preco);
            }

            window.showToast(this.editId ? 'Venda atualizada' : 'Venda criada com sucesso', 'success');
            this.closeForm();
            if (window.refreshCurrentPage) window.refreshCurrentPage();
        } catch (e) {
            window.showToast('Erro ao salvar venda: ' + (e.message || e), 'error');
        }
    }

    async openDetail(id) {
        try {
            const venda = await window.ngr.vendas.get(id);
            const itens = await window.ngr.vendas.itens(id);

            document.getElementById('venda-detail-id').textContent = venda.id;
            document.getElementById('venda-detail-cliente').textContent = venda.cliente_nome || '-';
            document.getElementById('venda-detail-data').textContent = venda.data;
            document.getElementById('venda-detail-total').textContent = 'R$ ' + Number(venda.total_final ?? venda.total ?? 0).toFixed(2);
            document.getElementById('venda-detail-pagamento').textContent = venda.forma_pagamento || '-';

            const statusEl = document.getElementById('venda-detail-status');
            statusEl.innerHTML = '<span class="status-badge ' + venda.status + '">' + venda.status + '</span>';

            const obsEl = document.getElementById('venda-detail-obs');
            if (venda.observacao) {
                obsEl.textContent = venda.observacao;
                obsEl.style.display = 'block';
            } else {
                obsEl.style.display = 'none';
            }

            const tbody = document.getElementById('venda-detail-items-tbody');
            if (itens.length) {
                tbody.innerHTML = itens.map(item => `<tr>
                    <td>${item.produto_nome || 'Produto #' + item.produto_id}</td>
                    <td>${item.qtd}</td>
                    <td>R$ ${Number(item.preco).toFixed(2)}</td>
                    <td class="valor">R$ ${(item.qtd * item.preco).toFixed(2)}</td>
                </tr>`).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state" style="padding:16px">Nenhum item cadastrado</td></tr>';
            }

            const tfoot = document.getElementById('venda-detail-items-tfoot');
            tfoot.innerHTML = `<tr style="font-weight:700">
                <td colspan="2"></td>
                <td>Total Produtos:</td>
                <td class="valor">R$ ${Number(venda.total_produtos ?? 0).toFixed(2)}</td>
            </tr>
            ${venda.total_desconto > 0 ? `<tr>
                <td colspan="2"></td>
                <td>Desconto:</td>
                <td class="valor negativo">- R$ ${Number(venda.total_desconto).toFixed(2)}</td>
            </tr>` : ''}
            <tr style="font-weight:700;color:var(--primary)">
                <td colspan="2"></td>
                <td>Total Final:</td>
                <td class="valor">R$ ${Number(venda.total_final ?? venda.total ?? 0).toFixed(2)}</td>
            </tr>`;

            const finalizarArea = document.getElementById('venda-detail-finalizar-area');
            const excluirArea = document.getElementById('venda-detail-excluir-area');
            const finalizarBtn = document.getElementById('venda-detail-finalizar');

            if (venda.status === 'rascunho' || venda.status === 'pendente') {
                finalizarArea.style.display = 'flex';
                finalizarBtn.disabled = false;
            } else {
                finalizarArea.style.display = 'flex';
                finalizarBtn.disabled = true;
                finalizarBtn.style.opacity = '.4';
                finalizarBtn.style.cursor = 'not-allowed';
            }

            if (venda.status !== 'cancelada') {
                excluirArea.style.display = 'flex';
            } else {
                excluirArea.style.display = 'none';
            }

            document.getElementById('venda-detail-modal').classList.remove('hidden');
        } catch (e) {
            window.showToast('Erro ao carregar detalhes da venda', 'error');
        }
    }

    closeDetail() {
        document.getElementById('venda-detail-modal').classList.add('hidden');
    }

    async finalizarVenda(id) {
        if (!confirm('Confirmar finalizacao desta venda?')) return;
        try {
            await window.ngr.vendas.finalizar(id, {});
            window.showToast('Venda finalizada com sucesso', 'success');
            this.closeDetail();
            if (window.refreshCurrentPage) window.refreshCurrentPage();
        } catch (e) {
            window.showToast('Erro ao finalizar venda: ' + (e.message || e), 'error');
        }
    }

    async excluirVenda(id) {
        if (!confirm('Tem certeza que deseja excluir esta venda? Esta acao nao pode ser desfeita.')) return;
        try {
            await window.ngr.vendas.remove(id);
            window.showToast('Venda removida', 'info');
            this.closeDetail();
            if (window.refreshCurrentPage) window.refreshCurrentPage();
        } catch (e) {
            window.showToast('Erro ao excluir venda: ' + (e.message || e), 'error');
        }
    }

    destroy() {
        if (this._outsideClick) {
            document.removeEventListener('click', this._outsideClick);
            this._outsideClick = null;
        }
        this.container.innerHTML = '';
    }
}
export default Vendas;
