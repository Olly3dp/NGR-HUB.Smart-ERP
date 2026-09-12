class Tarefas {
    constructor(container) { this.container = container; }

    async init() {
        this.render();
        this.filtro = {};
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div class="filter-bar">
                    <select class="form-control" id="filtro-tarefa-status">
                        <option value="">Todas</option>
                        <option value="pendente">Pendentes</option>
                        <option value="andamento">Em Andamento</option>
                        <option value="concluida">Concluidas</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btn-nova-tarefa"><i class="fas fa-plus"></i> Nova Tarefa</button>
            </div>
            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>Titulo</th><th>Prioridade</th><th>Vencimento</th><th>Status</th><th>Acoes</th></tr></thead>
                    <tbody id="tarefas-tbody"></tbody>
                </table></div>
                <div id="tarefas-empty" class="empty-state hidden"><i class="fas fa-tasks"></i><p>Nenhuma tarefa</p></div>
            </div>
            <div id="tarefa-modal" class="modal-overlay hidden">
                <div class="modal">
                    <h3>Nova Tarefa</h3>
                    <div class="form-group"><label>Titulo</label><input class="form-control" id="tarefa-titulo"></div>
                    <div class="form-group"><label>Descricao</label><textarea class="form-control" id="tarefa-desc"></textarea></div>
                    <div class="form-group"><label>Prioridade</label><select class="form-control" id="tarefa-prioridade"><option value="media">Media</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></div>
                    <div class="form-group"><label>Data Vencimento</label><input class="form-control" id="tarefa-vencimento" type="date"></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="tarefa-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="tarefa-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('filtro-tarefa-status').addEventListener('change', (e) => {
            this.filtro.status = e.target.value || undefined;
            this.load();
        });
        document.getElementById('btn-nova-tarefa').addEventListener('click', () => this.openForm());
        document.getElementById('tarefa-cancel').addEventListener('click', () => this.closeForm());
        document.getElementById('tarefa-save').addEventListener('click', () => this.save());
    }

    async load() {
        const data = await window.ngr.tarefas.list(this.filtro);
        const tbody = document.getElementById('tarefas-tbody');
        const empty = document.getElementById('tarefas-empty');
        if (!data || !data.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        tbody.innerHTML = data.map(t => `<tr>
            <td>${t.titulo}</td>
            <td class="prioridade-${t.prioridade}">${t.prioridade}</td>
            <td>${t.data_vencimento || '-'}</td>
            <td><span class="status-badge ${t.status}">${t.status}</span></td>
            ${window.actMenu([
                ...(t.status !== 'concluida' ? [window.actItem({ icon: 'fa-check', label: 'Concluir', cls: 'btn-concluir', attrs: 'data-id="' + t.id + '"' })] : []),
                window.actItem({ icon: 'fa-edit', label: 'Editar', cls: 'btn-editar-tarefa', attrs: 'data-id="' + t.id + '"' }),
                window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-tarefa', attrs: 'data-id="' + t.id + '"' }),
            ])}
        </tr>`).join('');

        tbody.querySelectorAll('.btn-concluir').forEach(btn => {
            btn.addEventListener('click', async () => {
                await window.ngr.tarefas.update(btn.dataset.id, { status: 'concluida' });
                this.load();
            });
        });
        tbody.querySelectorAll('.btn-excluir-tarefa').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir tarefa?')) return;
                await window.ngr.tarefas.remove(Number(btn.dataset.id));
                this.load();
            });
        });
        tbody.querySelectorAll('.btn-editar-tarefa').forEach(btn => {
            btn.addEventListener('click', async () => {
                const t = await window.ngr.tarefas.get(Number(btn.dataset.id));
                this.openForm(t);
            });
        });
    }

    openForm(d) {
        this.editId = d?.id || null;
        document.getElementById('tarefa-titulo').value = d?.titulo || '';
        document.getElementById('tarefa-desc').value = d?.descricao || '';
        document.getElementById('tarefa-prioridade').value = d?.prioridade || 'media';
        document.getElementById('tarefa-vencimento').value = d?.data_vencimento || '';
        document.getElementById('tarefa-modal').classList.remove('hidden');
    }

    closeForm() { document.getElementById('tarefa-modal').classList.add('hidden'); this.editId = null; }

    async save() {
        const dados = {
            titulo: document.getElementById('tarefa-titulo').value.trim(),
            descricao: document.getElementById('tarefa-desc').value.trim() || null,
            prioridade: document.getElementById('tarefa-prioridade').value,
            data_vencimento: document.getElementById('tarefa-vencimento').value || null,
        };
        if (!this.editId) dados.status = 'pendente';
        if (!dados.titulo) { window.showToast('Informe o titulo', 'error'); return; }
        if (this.editId) {
            await window.ngr.tarefas.update(this.editId, dados);
        } else {
            await window.ngr.tarefas.create(dados);
        }
        this.closeForm();
        this.load();
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Tarefas;
