class Clientes {
    constructor(container) { this.container = container; }

    async init() {
        this.selectedId = null;
        this.filtro = { nome: '' };
        this.render();
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div class="filter-bar">
                    <input class="form-control" id="filtro-nome" placeholder="Buscar por nome..." style="width:300px">
                </div>
                <button class="btn btn-primary" id="btn-novo-cliente"><i class="fas fa-plus"></i> Novo Cliente</button>
            </div>

            <div class="grid-4 mb-2" id="stats-clientes"></div>

            <div class="card mb-2" id="top-clientes-section">
                <div class="card-header"><h3>Top Clientes</h3> <span class="badge">mais compras</span></div>
                <div class="top-cards" id="top-clientes-cards"></div>
            </div>

            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>Nome</th><th>Email</th><th>Telefone</th><th>Total Compras</th><th>Ultima Compra</th><th>Acoes</th></tr></thead>
                    <tbody id="clientes-tbody"></tbody>
                </table></div>
                <div id="clientes-empty" class="empty-state hidden"><i class="fas fa-users"></i><p>Nenhum cliente encontrado</p></div>
            </div>

            <div id="cliente-detail" class="card hidden mt-2">
                <div class="flex-between mb-1">
                    <h3 id="detail-nome"></h3>
                    <button class="btn btn-ghost btn-sm" id="detail-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="grid-3 mb-2" id="detail-info"></div>
                <h4>Historico de Compras</h4>
                <div class="table-wrap"><table>
                    <thead><tr><th>Data</th><th>Valor</th><th>Forma Pagamento</th><th>Status</th></tr></thead>
                    <tbody id="detail-vendas-tbody"></tbody>
                </table></div>
                <div id="detail-vendas-empty" class="empty-state hidden"><i class="fas fa-receipt"></i><p>Nenhuma venda encontrada</p></div>
            </div>

            <div id="cliente-modal" class="modal-overlay hidden">
                <div class="modal">
                    <h3 id="cliente-modal-title">Novo Cliente</h3>
                    <div class="form-group"><label>Nome *</label><input class="form-control" id="cliente-nome"></div>
                    <div class="form-group"><label>CPF/CNPJ</label><input class="form-control" id="cliente-cpfcnpj"></div>
                    <div class="form-group"><label>Email</label><input class="form-control" id="cliente-email" type="email"></div>
                    <div class="form-group"><label>Telefone</label><input class="form-control" id="cliente-telefone"></div>
                    <div class="form-group"><label>Endereco</label><textarea class="form-control" id="cliente-endereco"></textarea></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="cliente-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="cliente-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('filtro-nome').addEventListener('input', (e) => {
            this.filtro.nome = e.target.value;
            this.load();
        });
        document.getElementById('btn-novo-cliente').addEventListener('click', () => this.openForm());
        document.getElementById('cliente-cancel').addEventListener('click', () => this.closeForm());
        document.getElementById('cliente-save').addEventListener('click', () => this.save());
        document.getElementById('detail-close').addEventListener('click', () => this.closeDetail());
    }

    async load() {
        const [clientes, topClientes] = await Promise.all([
            window.ngr.clientes.list(this.filtro),
            window.ngr.clientes.top(5),
        ]);

        this.renderStats(clientes, topClientes);
        this.renderTop(topClientes);
        this.renderTable(clientes);
    }

    renderStats(clientes, topClientes) {
        const total = clientes ? clientes.length : 0;
        const totalCompras = clientes ? clientes.reduce((s, c) => s + Number(c.total_compras || 0), 0) : 0;
        const media = total > 0 ? totalCompras / total : 0;
        const topLen = topClientes && topClientes.length ? Math.min(topClientes.length, 5) : 0;

        document.getElementById('stats-clientes').innerHTML = `
            <div class="stat-card primary"><i class="fas fa-users stat-icon"></i><div class="stat-label">Total Clientes</div><div class="stat-value">${total}</div></div>
            <div class="stat-card success"><i class="fas fa-dollar-sign stat-icon"></i><div class="stat-label">Total Compras</div><div class="stat-value">R$ ${totalCompras.toFixed(2)}</div></div>
            <div class="stat-card warning"><i class="fas fa-chart-line stat-icon"></i><div class="stat-label">Ticket Medio</div><div class="stat-value">R$ ${media.toFixed(2)}</div></div>
            <div class="stat-card info"><i class="fas fa-trophy stat-icon"></i><div class="stat-label">Top Clientes</div><div class="stat-value">${topLen}</div></div>
        `;
    }

    renderTop(lista) {
        const container = document.getElementById('top-clientes-cards');
        if (!lista.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>Nenhum cliente com compras</p></div>';
            return;
        }
        container.innerHTML = lista.map((c, i) => `
            <div class="stat-card" style="cursor:pointer" data-id="${c.id}">
                <div class="flex-between" style="margin-bottom:4px">
                    <span class="badge" style="background:var(--primary);color:#000">#${i + 1}</span>
                </div>
                <div class="stat-value" style="font-size:1rem">${c.nome}</div>
                <div class="stat-label">Total: R$ ${Number(c.total_compras || 0).toFixed(2)}</div>
                <div class="stat-label" style="font-size:0.75rem">Ultima: ${c.ultima_compra || '-'}</div>
            </div>
        `).join('');

        container.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('click', () => this.showDetail(Number(el.dataset.id)));
        });
    }

    renderTable(clientes) {
        const tbody = document.getElementById('clientes-tbody');
        const empty = document.getElementById('clientes-empty');
        if (!clientes.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        tbody.innerHTML = clientes.map(c => `
            <tr class="cliente-row" data-id="${c.id}" style="cursor:pointer">
                <td class="truncate" title="${c.nome}">${c.nome}</td>
                <td>${c.email || '-'}</td>
                <td>${c.telefone || '-'}</td>
                <td>R$ ${Number(c.total_compras || 0).toFixed(2)}</td>
                <td>${c.ultima_compra || '-'}</td>
                <td onclick="event.stopPropagation()">
                    ${window.actMenu([
                        window.actItem({ icon: 'fa-edit', label: 'Editar', cls: 'btn-editar', attrs: 'data-id="' + c.id + '"' }),
                        window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir', attrs: 'data-id="' + c.id + '"' }),
                    ])}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.cliente-row').forEach(row => {
            row.addEventListener('click', () => this.showDetail(Number(row.dataset.id)));
        });
        tbody.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', () => this.openForm({ id: Number(btn.dataset.id) }));
        });
        tbody.querySelectorAll('.btn-excluir').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir cliente?')) return;
                await window.ngr.clientes.remove(Number(btn.dataset.id));
                window.showToast('Cliente removido', 'info');
                this.closeDetail();
                this.load();
            });
        });
    }

    async showDetail(id) {
        this.selectedId = id;
        const [cliente, vendas] = await Promise.all([
            window.ngr.clientes.get(id),
            window.ngr.vendas.list({ cliente_id: id }),
        ]);
        if (!cliente) return;

        const detail = document.getElementById('cliente-detail');
        detail.classList.remove('hidden');

        document.getElementById('detail-nome').textContent = cliente.nome;

        document.getElementById('detail-info').innerHTML = `
            <div><strong>CPF/CNPJ:</strong> ${cliente.cpf_cnpj || '-'}</div>
            <div><strong>Email:</strong> ${cliente.email || '-'}</div>
            <div><strong>Telefone:</strong> ${cliente.telefone || '-'}</div>
            <div><strong>Endereco:</strong> ${cliente.endereco || '-'}</div>
            <div><strong>Total Compras:</strong> R$ ${Number(cliente.total_compras || 0).toFixed(2)}</div>
            <div><strong>Ultima Compra:</strong> ${cliente.ultima_compra || '-'}</div>
        `;

        const tbody = document.getElementById('detail-vendas-tbody');
        const empty = document.getElementById('detail-vendas-empty');
        if (!vendas.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = vendas.map(v => `
            <tr>
                <td>${v.data || '-'}</td>
                <td class="valor positivo">R$ ${Number(v.valor || 0).toFixed(2)}</td>
                <td>${v.forma_pagamento || '-'}</td>
                <td><span class="status-badge ${v.status || 'pendente'}">${v.status || '-'}</span></td>
            </tr>
        `).join('');
    }

    closeDetail() {
        this.selectedId = null;
        document.getElementById('cliente-detail').classList.add('hidden');
    }

    async openForm(dados) {
        this.editId = dados?.id || null;
        document.getElementById('cliente-modal-title').textContent = this.editId ? 'Editar Cliente' : 'Novo Cliente';

        if (this.editId) {
            const c = await window.ngr.clientes.get(this.editId);
            if (!c) return;
            document.getElementById('cliente-nome').value = c.nome || '';
            document.getElementById('cliente-cpfcnpj').value = c.cpf_cnpj || '';
            document.getElementById('cliente-email').value = c.email || '';
            document.getElementById('cliente-telefone').value = c.telefone || '';
            document.getElementById('cliente-endereco').value = c.endereco || '';
        } else {
            document.getElementById('cliente-nome').value = '';
            document.getElementById('cliente-cpfcnpj').value = '';
            document.getElementById('cliente-email').value = '';
            document.getElementById('cliente-telefone').value = '';
            document.getElementById('cliente-endereco').value = '';
        }

        document.getElementById('cliente-modal').classList.remove('hidden');
    }

    closeForm() {
        document.getElementById('cliente-modal').classList.add('hidden');
        this.editId = null;
    }

    async save() {
        const dados = {
            nome: document.getElementById('cliente-nome').value.trim(),
            cpf_cnpj: document.getElementById('cliente-cpfcnpj').value.trim() || null,
            email: document.getElementById('cliente-email').value.trim() || null,
            telefone: document.getElementById('cliente-telefone').value.trim() || null,
            endereco: document.getElementById('cliente-endereco').value.trim() || null,
        };
        if (!dados.nome) {
            window.showToast('Nome e obrigatorio', 'error');
            return;
        }
        if (this.editId) {
            await window.ngr.clientes.update(this.editId, dados);
            window.showToast('Cliente atualizado', 'success');
        } else {
            await window.ngr.clientes.create(dados);
            window.showToast('Cliente criado', 'success');
        }
        this.closeForm();
        this.closeDetail();
        await this.load();
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Clientes;
