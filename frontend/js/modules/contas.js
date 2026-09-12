class Contas {
    constructor(container) { this.container = container; }

    async init() {
        this.render();
        this.filtro = { status: '' };
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div class="filter-bar">
                    <select class="form-control" id="filtro-status">
                        <option value="">Todas</option>
                        <option value="pendente">Pendentes</option>
                        <option value="pago">Pagas</option>
                        <option value="atrasado">Atrasadas</option>
                        <option value="cancelado">Canceladas</option>
                    </select>
                    <select class="form-control" id="filtro-tipo">
                        <option value="">Todos</option>
                        <option value="despesa">Despesas</option>
                        <option value="receita">Receitas</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btn-nova-conta"><i class="fas fa-plus"></i> Nova Conta</button>
            </div>
            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>Titulo</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Categoria</th><th>Status</th><th>Acoes</th></tr></thead>
                    <tbody id="contas-tbody"></tbody>
                </table></div>
                <div id="contas-empty" class="empty-state hidden"><i class="fas fa-inbox"></i><p>Nenhuma conta encontrada</p></div>
            </div>
            <div id="conta-modal" class="modal-overlay hidden">
                <div class="modal">
                    <h3 id="conta-modal-title">Nova Conta</h3>
                    <div class="form-group"><label>Titulo</label><input class="form-control" id="conta-descricao"></div>
                    <div class="form-group"><label>Valor (R$)</label><input class="form-control" id="conta-valor" type="number" step="0.01"></div>
                    <div class="form-group"><label>Data Vencimento</label><input class="form-control" id="conta-vencimento" type="date"></div>
                    <div class="form-group"><label>Tipo</label><select class="form-control" id="conta-tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div>
                    <div class="form-group"><label>Categoria</label><select class="form-control" id="conta-categoria"></select></div>
                    <div class="form-group"><label>Observacao</label><textarea class="form-control" id="conta-obs"></textarea></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="conta-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="conta-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('filtro-status').addEventListener('change', (e) => {
            this.filtro.status = e.target.value || undefined;
            this.load();
        });
        document.getElementById('filtro-tipo').addEventListener('change', (e) => {
            this.filtro.tipo = e.target.value || undefined;
            this.load();
        });
        document.getElementById('btn-nova-conta').addEventListener('click', () => this.openForm());
        document.getElementById('conta-cancel').addEventListener('click', () => this.closeForm());
        document.getElementById('conta-save').addEventListener('click', () => this.save());
    }

    async load() {
        const data = await window.ngr.contas.list(this.filtro);
        const tbody = document.getElementById('contas-tbody');
        const empty = document.getElementById('contas-empty');
        if (!data || !data.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.map(c => `<tr>
            <td class="truncate" title="${c.descricao}">${c.descricao}</td>
            <td class="valor ${c.tipo === 'despesa' ? 'negativo' : 'positivo'}">R$ ${Number(c.valor).toFixed(2)}</td>
            <td>${c.data_vencimento}</td>
            <td>${c.data_pagamento || '-'}</td>
            <td>${c.categoria_nome || '-'}</td>
            <td><span class="status-badge ${c.status}">${c.status}</span></td>
            ${window.actMenu([
                ...(c.status === 'pendente' || c.status === 'atrasado' ? [window.actItem({ icon: 'fa-check', label: 'Pagar', cls: 'btn-pagar', attrs: 'data-id="' + c.id + '"' })] : []),
                window.actItem({ icon: 'fa-edit', label: 'Editar', cls: 'btn-editar-conta', attrs: 'data-id="' + c.id + '"' }),
                window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-conta', attrs: 'data-id="' + c.id + '"' }),
            ])}
        </tr>`).join('');

        tbody.querySelectorAll('.btn-pagar').forEach(btn => {
            btn.addEventListener('click', async () => {
                await window.ngr.contas.pagar(btn.dataset.id);
                window.showToast('Conta paga com sucesso', 'success');
                this.load();
            });
        });
        tbody.querySelectorAll('.btn-excluir-conta').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir conta?')) return;
                await window.ngr.contas.remove(Number(btn.dataset.id));
                window.showToast('Conta removida', 'info');
                this.load();
            });
        });
        tbody.querySelectorAll('.btn-editar-conta').forEach(btn => {
            btn.addEventListener('click', async () => {
                const c = await window.ngr.contas.get(Number(btn.dataset.id));
                this.openForm(c);
            });
        });
    }

    async openForm(dados) {
        this.editId = dados?.id || null;
        document.getElementById('conta-modal-title').textContent = this.editId ? 'Editar Conta' : 'Nova Conta';
        document.getElementById('conta-descricao').value = dados?.descricao || '';
        document.getElementById('conta-valor').value = dados?.valor || '';
        document.getElementById('conta-vencimento').value = dados?.data_vencimento || '';
        document.getElementById('conta-tipo').value = dados?.tipo || 'despesa';
        document.getElementById('conta-obs').value = dados?.observacao || '';

        const select = document.getElementById('conta-categoria');
        const cats = await window.ngr.categorias.list();
        select.innerHTML = cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        if (dados?.categoria_id) select.value = dados.categoria_id;

        document.getElementById('conta-modal').classList.remove('hidden');
    }

    closeForm() {
        document.getElementById('conta-modal').classList.add('hidden');
        this.editId = null;
    }

    async save() {
        const dados = {
            descricao: document.getElementById('conta-descricao').value.trim(),
            valor: parseFloat(document.getElementById('conta-valor').value),
            data_vencimento: document.getElementById('conta-vencimento').value,
            tipo: document.getElementById('conta-tipo').value,
            categoria_id: parseInt(document.getElementById('conta-categoria').value) || null,
            observacao: document.getElementById('conta-obs').value.trim() || null,
        };
        if (!this.editId) dados.status = 'pendente';
        if (!dados.descricao || !dados.valor || !dados.data_vencimento) {
            window.showToast('Preencha titulo, valor e vencimento', 'error'); return;
        }
        if (this.editId) {
            await window.ngr.contas.update(this.editId, dados);
            window.showToast('Conta atualizada', 'success');
        } else {
            await window.ngr.contas.create(dados);
            window.showToast('Conta criada', 'success');
        }
        this.closeForm();
        this.load();
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Contas;
