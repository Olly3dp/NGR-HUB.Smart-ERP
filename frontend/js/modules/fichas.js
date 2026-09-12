class Fichas {
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
                    <select class="form-control" id="filtro-ficha-status">
                        <option value="">Todas</option>
                        <option value="rascunho">Rascunho</option>
                        <option value="ativo">Ativo</option>
                        <option value="arquivado">Arquivado</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btn-nova-ficha"><i class="fas fa-plus"></i> Nova Ficha</button>
            </div>
            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>Titulo</th><th>Tipo</th><th>Status</th><th>Atualizado</th><th>Acoes</th></tr></thead>
                    <tbody id="fichas-tbody"></tbody>
                </table></div>
                <div id="fichas-empty" class="empty-state hidden"></div>
            </div>
            <div id="ficha-modal" class="modal-overlay hidden">
                <div class="modal">
                    <h3>Nova Ficha Tecnica</h3>
                    <div class="form-group"><label>Titulo</label><input class="form-control" id="ficha-titulo"></div>
                    <div class="form-group"><label>Tipo</label><input class="form-control" id="ficha-tipo" placeholder="ex: Processo, Produto, Servico"></div>
                    <div class="form-group"><label>Conteudo</label><textarea class="form-control" id="ficha-conteudo" rows="6"></textarea></div>
                    <div class="form-group"><label>Status</label><select class="form-control" id="ficha-status"><option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="arquivado">Arquivado</option></select></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="ficha-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="ficha-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('filtro-ficha-status').addEventListener('change', (e) => {
            this.filtro.status = e.target.value || undefined;
            this.load();
        });
        document.getElementById('btn-nova-ficha').addEventListener('click', () => this.openForm());
        document.getElementById('ficha-cancel').addEventListener('click', () => this.closeForm());
        document.getElementById('ficha-save').addEventListener('click', () => this.save());
    }

    async load() {
        const data = await window.ngr.fichas.list(this.filtro);
        const tbody = document.getElementById('fichas-tbody');
        const empty = document.getElementById('fichas-empty');
        if (!data || !data.length) {
            tbody.innerHTML = '';
            empty.innerHTML = '<i class="fas fa-clipboard-list"></i><p>Nenhuma ficha tecnica</p>';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = data.map(f => `<tr>
            <td>${f.titulo}</td>
            <td>${f.tipo || '-'}</td>
            <td><span class="status-badge ${f.status}">${f.status}</span></td>
            <td>${f.updated_at ? f.updated_at.slice(0, 10) : '-'}</td>
            ${window.actMenu([
                window.actItem({ icon: 'fa-edit', label: 'Editar', cls: 'btn-editar-ficha', attrs: 'data-id="' + f.id + '"' }),
                window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-ficha', attrs: 'data-id="' + f.id + '"' }),
            ])}
        </tr>`).join('');

        tbody.querySelectorAll('.btn-editar-ficha').forEach(btn => {
            btn.addEventListener('click', async () => {
                const f = await window.ngr.fichas.get(Number(btn.dataset.id));
                this.openForm(f);
            });
        });
        tbody.querySelectorAll('.btn-excluir-ficha').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir ficha tecnica?')) return;
                await window.ngr.fichas.remove(Number(btn.dataset.id));
                this.load();
            });
        });
    }

    openForm(d) {
        this.editId = d?.id || null;
        document.getElementById('ficha-titulo').value = d?.titulo || '';
        document.getElementById('ficha-tipo').value = d?.tipo || '';
        document.getElementById('ficha-conteudo').value = d?.conteudo || '';
        document.getElementById('ficha-status').value = d?.status || 'rascunho';
        document.getElementById('ficha-modal').classList.remove('hidden');
    }

    closeForm() { document.getElementById('ficha-modal').classList.add('hidden'); this.editId = null; }

    async save() {
        const dados = {
            titulo: document.getElementById('ficha-titulo').value.trim(),
            tipo: document.getElementById('ficha-tipo').value.trim() || null,
            conteudo: document.getElementById('ficha-conteudo').value.trim() || null,
            status: document.getElementById('ficha-status').value,
        };
        if (!dados.titulo) { window.showToast('Informe o titulo', 'error'); return; }
        if (this.editId) { await window.ngr.fichas.update(this.editId, dados); }
        else { await window.ngr.fichas.create(dados); }
        this.closeForm();
        this.load();
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Fichas;
