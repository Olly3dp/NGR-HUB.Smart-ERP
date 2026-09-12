class Documentos {
    constructor(container) { this.container = container; }

    async init() {
        this.render();
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div></div>
                <button class="btn btn-primary" id="btn-upload-doc"><i class="fas fa-upload"></i> Upload Documento</button>
            </div>
            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th></th><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Data</th><th>Vinculo</th><th>Acoes</th></tr></thead>
                    <tbody id="docs-tbody"></tbody>
                </table></div>
                <div id="docs-empty" class="empty-state hidden"></div>
            </div>
        `;

        document.getElementById('btn-upload-doc').addEventListener('click', () => this.upload());
    }

    async load() {
        const data = await window.ngr.documentos.list();
        const tbody = document.getElementById('docs-tbody');
        const empty = document.getElementById('docs-empty');
        if (!data || !data.length) {
            tbody.innerHTML = '';
            empty.innerHTML = '<i class="fas fa-paperclip"></i><p>Nenhum documento</p>';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        const ordenados = [...data].sort((a, b) => (this.favValue(b) - this.favValue(a)));
        tbody.innerHTML = ordenados.map(d => {
            const size = d.tamanho > 1048576 ? (d.tamanho / 1048576).toFixed(1) + ' MB' : (d.tamanho / 1024).toFixed(0) + ' KB';
            const icon = d.tipo === 'pdf' ? 'fa-file-pdf' : d.tipo?.match(/^(doc|docx)/) ? 'fa-file-word' : d.tipo?.match(/^(xls|xlsx)/) ? 'fa-file-excel' : d.tipo?.match(/^(png|jpg|jpeg)/) ? 'fa-file-image' : 'fa-file';
            const fav = this.favValue(d);
            return `<tr class="${fav ? 'doc-favorito' : ''}">
                <td><button class="btn btn-ghost btn-sm btn-fav-doc" data-id="${d.id}" data-fav="${fav}" data-nome="${this.escAttr(d.nome_original || '')}" title="${fav ? 'Remover dos favoritos' : 'Favoritar'}">
                    <i class="fas fa-star${fav ? '' : ' far'}" style="color:${fav ? 'var(--primary)' : 'var(--text2)'}"></i>
                </button></td>
                <td><i class="fas ${icon}" style="color:var(--primary);margin-right:8px"></i>${d.nome_original}</td>
                <td>${d.tipo.toUpperCase()}</td>
                <td>${size}</td>
                <td>${d.created_at ? d.created_at.slice(0, 10) : '-'}</td>
                <td>${d.referencia_tipo || '-'}</td>
                ${window.actMenu([
                    window.actItem({ icon: 'fa-eye', label: 'Visualizar', cls: 'btn-preview-doc', attrs: 'data-id="' + d.id + '"' }),
                    window.actItem({ icon: 'fa-pen', label: 'Renomear', cls: 'btn-renomear-doc', attrs: 'data-id="' + d.id + '"' }),
                    window.actItem({ icon: 'fa-download', label: 'Download', cls: 'btn-download', attrs: 'data-id="' + d.id + '"' }),
                    window.actItem({ icon: 'fa-font', label: 'OCR - Extrair texto', cls: 'btn-ocr-doc', attrs: 'data-id="' + d.id + '"' }),
                    window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-doc', attrs: 'data-id="' + d.id + '"' }),
                ])}
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => window.ngr.documentos.download(Number(btn.dataset.id)));
        });
        tbody.querySelectorAll('.btn-excluir-doc').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir documento?')) return;
                await window.ngr.documentos.remove(Number(btn.dataset.id));
                this.load();
            });
        });
        tbody.querySelectorAll('.btn-ocr-doc').forEach(btn => {
            btn.addEventListener('click', () => this.ocr(Number(btn.dataset.id)));
        });
        tbody.querySelectorAll('.btn-preview-doc').forEach(btn => {
            btn.addEventListener('click', () => this.preview(Number(btn.dataset.id)));
        });
        tbody.querySelectorAll('.btn-renomear-doc').forEach(btn => {
            btn.addEventListener('click', async () => this.rename(Number(btn.dataset.id)));
        });
        tbody.querySelectorAll('.btn-fav-doc').forEach(btn => {
            btn.addEventListener('click', async () => this.toggleFav(btn, Number(btn.dataset.fav) === 1));
        });
    }

    async upload() {
        const result = await window.ngr.documentos.upload({});
        if (result.success) {
            window.showToast('Documento enviado', 'success');
            this.load();
        } else if (!result.canceled) {
            window.showToast('Erro ao enviar: ' + result.error, 'error');
        }
    }

    async ocr(id) {
        const btn = this.container.querySelector(`.btn-ocr-doc[data-id="${id}"]`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            const res = await window.ngr.documentos.ocr(id);
            if (res.success) {
                window.showModal(`
                    <h3>Texto Extraído</h3>
                    <pre style="max-height:400px;overflow:auto;white-space:pre-wrap;background:#111;padding:12px;border-radius:8px;font-size:13px">${this.escapeHtml(res.texto || '(sem texto)')}</pre>
                `, 'OCR');
            } else {
                window.showToast('OCR: ' + res.error, 'error');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-font"></i>'; }
        }
    }

    async preview(id) {
        const btn = this.container.querySelector(`.btn-preview-doc[data-id="${id}"]`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            const res = await window.ngr.documentos.preview(id);
            if (!res || !res.success) {
                window.showToast('Preview: ' + (res?.error || 'erro'), 'error');
                return;
            }
            if (res.tipo === 'imagem') {
                window.showModal(`
                    <div style="text-align:center">
                        <img src="${res.data}" style="max-width:100%;max-height:60vh;border-radius:8px">
                    </div>
                `, 'Visualizar');
            } else if (res.tipo === 'pdf') {
                window.showModal(`
                    <iframe src="${res.data}" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:8px;background:#fff"></iframe>
                `, 'Visualizar PDF');
            } else if (res.tipo === 'texto') {
                window.showModal(`
                    <pre style="max-height:400px;overflow:auto;white-space:pre-wrap;background:#111;padding:12px;border-radius:8px;font-size:13px">${this.escapeHtml(res.data || '(vazio)')}</pre>
                `, 'Visualizar');
            } else {
                window.showModal(`
                    <p style="color:var(--text2)">Este tipo de arquivo nao possui preview integrado.</p>
                    <p style="margin-top:.6rem">Use <i class="fas fa-font"></i> OCR para extrair texto ou <i class="fas fa-download"></i> Download para abrir o arquivo original.</p>
                `, 'Visualizar');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
        }
    }

    async rename(id) {
        const doc = (await window.ngr.documentos.list()).find(d => d.id === id);
        const atual = doc?.nome_original || '';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <h3><i class="fas fa-pen" style="color:var(--primary);margin-right:6px"></i> Renomear Arquivo</h3>
                    <button class="modal-close" style="background:none;border:none;color:var(--text2);font-size:1.4rem;cursor:pointer;line-height:1">&times;</button>
                </div>
                <div class="form-group"><label>Novo nome do arquivo</label>
                    <input class="form-control" id="doc-rename-input" value="${this.escAttr(atual)}" placeholder="Nome do arquivo">
                </div>
                <div class="modal-actions">
                    <button class="btn btn-ghost" id="doc-rename-cancel">Cancelar</button>
                    <button class="btn btn-primary" id="doc-rename-save"><i class="fas fa-check"></i> Salvar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        const input = overlay.querySelector('#doc-rename-input');

        overlay.querySelector('.modal-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#doc-rename-cancel').addEventListener('click', close);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); overlay.querySelector('#doc-rename-save').click(); } });

        overlay.querySelector('#doc-rename-save').addEventListener('click', async () => {
            const novo = input.value.trim();
            if (novo && novo !== atual) {
                await window.ngr.documentos.update(id, { nome_original: novo });
                window.showToast('Documento renomeado', 'success');
                this.load();
            } else if (!novo) {
                input.focus();
                input.style.borderColor = 'var(--red)';
                return;
            }
            close();
        });

        input.focus();
        input.select();
    }

    favValue(d) { return Number(d.is_favorite != null ? d.is_favorite : (d.favorito || 0)); }

    async toggleFav(btn, ativo) {
        const id = Number(btn.dataset.id);
        const novoFav = ativo ? 0 : 1;
        // Feedback visual imediato
        const icon = btn.querySelector('i');
        icon.style.color = novoFav ? 'var(--primary)' : 'var(--text2)';
        icon.classList.toggle('far', !novoFav);
        btn.dataset.fav = String(novoFav);
        btn.title = novoFav ? 'Remover dos favoritos' : 'Favoritar';
        btn.closest('tr')?.classList.toggle('doc-favorito', novoFav === 1);
        try {
            await window.ngr.documentos.update(id, { is_favorite: novoFav, favorito: novoFav });
            window.showToast(novoFav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', novoFav ? 'success' : 'info');
        } catch (e) {
            window.showToast('Erro ao atualizar favorito: ' + e.message, 'error');
        }
    }

    escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    escAttr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    destroy() { this.container.innerHTML = ''; }
}
export default Documentos;
