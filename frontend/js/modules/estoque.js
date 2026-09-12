class Estoque {
    constructor(container) { this.container = container; }

    async init() {
        this.render();
        this.filtro = { nome: '' };
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div id="estoque-baixo-banner" class="estoque-baixo-banner hidden"></div>

            <div class="flex-between mb-2">
                <div class="filter-bar">
                    <input class="form-control" id="filtro-estoque" placeholder="Buscar produto..." style="width:280px">
                    <select class="form-control" id="filtro-estoque-categoria">
                        <option value="">Todas Categorias</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btn-novo-produto"><i class="fas fa-plus"></i> Novo Produto</button>
            </div>

            <div class="card">
                <div class="table-wrap"><table>
                    <thead><tr><th>Nome</th><th>SKU</th><th>Estoque</th><th>Est. Minimo</th><th>Preco Custo</th><th>Preco Venda</th><th>Fornecedor</th><th>Acoes</th></tr></thead>
                    <tbody id="estoque-tbody"></tbody>
                </table></div>
                <div id="estoque-empty" class="empty-state hidden"><i class="fas fa-box"></i><p>Nenhum produto encontrado</p></div>
            </div>

            <div id="produto-modal" class="modal-overlay hidden">
                <div class="modal modal-lg">
                    <h3 id="produto-modal-title">Novo Produto</h3>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>Nome</label><input class="form-control" id="prod-nome"></div>
                        <div class="form-group flex-1"><label>SKU</label><input class="form-control" id="prod-sku"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>Cod. Barras</label><input class="form-control" id="prod-codigo-barras"></div>
                        <div class="form-group flex-1"><label>NCM</label><input class="form-control" id="prod-ncm"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>Tipo</label><select class="form-control" id="prod-tipo"><option value="produto">Produto (controla estoque)</option><option value="servico">Servico (nao controla estoque)</option></select></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>Unidade</label><select class="form-control" id="prod-unidade"><option value="un">un</option><option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="ml">ml</option><option value="m">m</option><option value="cx">cx</option><option value="pc">pc</option><option value="pct">pct</option></select></div>
                        <div class="form-group flex-1"><label>Categoria</label><select class="form-control" id="prod-categoria"></select></div>
                        <div class="form-group flex-1"><label>Fornecedor <span class="text-muted">(opcional)</span></label><select class="form-control" id="prod-fornecedor"></select></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1"><label>Preco Custo (R$)</label><input class="form-control" id="prod-preco-custo" type="number" step="0.01"></div>
                        <div class="form-group flex-1"><label>Preco Venda (R$)</label><input class="form-control" id="prod-preco-venda" type="number" step="0.01"></div>
                        <div class="form-group flex-1"><label>Preco Minimo (R$)</label><input class="form-control" id="prod-preco-minimo" type="number" step="0.01"></div>
                    </div>
                    <div class="form-group">
                        <button class="btn btn-ghost btn-sm" id="btn-calcular-preco" type="button"><i class="fas fa-calculator"></i> Calcular Preco Sugerido</button>
                        <span id="prod-preco-sugerido" class="ml-1 text-muted"></span>
                    </div>
                    <div class="form-row" id="prod-estoque-fields">
                        <div class="form-group flex-1"><label>Estoque Atual</label><input class="form-control" id="prod-estoque-atual" type="number" step="0.001"></div>
                        <div class="form-group flex-1"><label>Estoque Minimo</label><input class="form-control" id="prod-estoque-minimo" type="number" step="0.001"></div>
                        <div class="form-group flex-1"><label>Estoque Maximo</label><input class="form-control" id="prod-estoque-maximo" type="number" step="0.001"></div>
                    </div>
                    <div class="form-group"><label>Descricao</label><textarea class="form-control" id="prod-descricao" rows="2"></textarea></div>
                    <div class="form-group"><label><input type="checkbox" id="prod-ativo" checked> Produto Ativo</label></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="prod-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="prod-save">Salvar</button>
                    </div>
                </div>
            </div>

            <div id="movimento-modal" class="modal-overlay hidden">
                <div class="modal" style="max-width:400px">
                    <h3 id="movimento-modal-title">Movimentar Estoque</h3>
                    <p id="movimento-produto-info" class="text-muted mb-1"></p>
                    <div class="form-group"><label id="movimento-qtd-label">Quantidade</label><input class="form-control" id="movimento-qtd" type="number" step="0.001"></div>
                    <div class="form-group"><label>Observacao</label><input class="form-control" id="movimento-obs"></div>
                    <div class="form-group hidden" id="movimento-doc-group"><label>Documento</label><input class="form-control" id="movimento-doc"></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="movimento-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="movimento-confirm">Confirmar</button>
                    </div>
                </div>
            </div>

            <div id="historico-modal" class="modal-overlay hidden">
                <div class="modal modal-lg">
                    <div class="flex-between mb-1">
                        <h3 id="historico-modal-title">Historico de Movimentos</h3>
                        <button class="btn btn-ghost btn-sm" id="historico-close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="table-wrap" style="max-height:400px;overflow-y:auto"><table>
                        <thead><tr><th>Data</th><th>Tipo</th><th>Qtd</th><th>Saldo</th><th>Obs</th><th>Documento</th></tr></thead>
                        <tbody id="historico-tbody"></tbody>
                    </table></div>
                    <div id="historico-empty" class="empty-state hidden"><i class="fas fa-history"></i><p>Nenhum movimento registrado</p></div>
                </div>
            </div>
        `;

        document.getElementById('filtro-estoque').addEventListener('input', (e) => {
            this.filtro.nome = e.target.value.trim();
            this.load();
        });
        document.getElementById('filtro-estoque-categoria').addEventListener('change', (e) => {
            this.filtro.categoria_id = e.target.value ? Number(e.target.value) : undefined;
            this.load();
        });
        document.getElementById('btn-novo-produto').addEventListener('click', () => this.openForm());
        document.getElementById('prod-tipo').addEventListener('change', () => this.toggleTipoFields());
        document.getElementById('prod-cancel').addEventListener('click', () => this.closeForm());
        document.getElementById('prod-save').addEventListener('click', () => this.saveProduto());
        document.getElementById('btn-calcular-preco').addEventListener('click', () => this.calcularPreco());
        document.getElementById('movimento-cancel').addEventListener('click', () => this.closeMovimento());
        document.getElementById('movimento-confirm').addEventListener('click', () => this.confirmMovimento());
        document.getElementById('historico-close').addEventListener('click', () => this.closeHistorico());
    }

    toggleTipoFields() {
        const servico = document.getElementById('prod-tipo').value === 'servico';
        document.getElementById('prod-estoque-fields').style.display = servico ? 'none' : '';
    }

    async load() {
        const [data, categorias] = await Promise.all([
            window.ngr.produtos.list(this.filtro),
            window.ngr.categorias.list(),
        ]);
        const selectCat = document.getElementById('filtro-estoque-categoria');
        const currentCat = selectCat.value;
        selectCat.innerHTML = '<option value="">Todas Categorias</option>' +
            categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        selectCat.value = currentCat || '';

        const tbody = document.getElementById('estoque-tbody');
        const empty = document.getElementById('estoque-empty');
        if (!data || !data.length) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            this.updateLowStockBanner([]);
            return;
        }
        empty.classList.add('hidden');

        tbody.innerHTML = data.map(p => {
            const isServico = p.tipo === 'servico';
            const low = !isServico && p.estoque_atual <= p.estoque_minimo;
            const fornecedor = p.fornecedor_nome || 'Proprio';
            const estoqueCell = isServico
                ? '<span class="text-muted">Servico</span>'
                : `<span class="${low ? 'text-danger fw-bold' : ''}">${Number(p.estoque_atual).toFixed(3)}</span>`;
            const minimoCell = isServico ? '<span class="text-muted">-</span>' : `${Number(p.estoque_minimo).toFixed(3)}`;
            const acoes = [];
            acoes.push(window.actItem({ icon: 'fa-edit', label: 'Editar', cls: 'btn-editar-prod', attrs: 'data-id="' + p.id + '"' }));
            if (!isServico) {
                acoes.push(window.actItem({ icon: 'fa-arrow-down', label: 'Entrada', cls: 'btn-movimento', attrs: 'data-id="' + p.id + '" data-nome="' + p.nome + '" data-tipo="entrada"' }));
                acoes.push(window.actItem({ icon: 'fa-arrow-up', label: 'Saida', cls: 'btn-movimento', attrs: 'data-id="' + p.id + '" data-nome="' + p.nome + '" data-tipo="saida"' }));
                acoes.push(window.actItem({ icon: 'fa-sliders-h', label: 'Ajuste', cls: 'btn-movimento', attrs: 'data-id="' + p.id + '" data-nome="' + p.nome + '" data-tipo="ajuste"' }));
                acoes.push(window.actItem({ icon: 'fa-history', label: 'Movimentos', cls: 'btn-historico', attrs: 'data-id="' + p.id + '" data-nome="' + p.nome + '"' }));
            }
            acoes.push(window.actItem({ icon: 'fa-trash', label: 'Excluir', danger: true, cls: 'btn-excluir-prod', attrs: 'data-id="' + p.id + '"' }));
            return `<tr class="${low ? 'row-low-stock' : ''}">
                <td class="truncate" title="${p.nome}" style="cursor:pointer" data-produto-id="${p.id}">${p.nome}${isServico ? ' <span class="badge badge-servico">Servico</span>' : ''}</td>
                <td>${p.sku || '-'}</td>
                <td>${estoqueCell}</td>
                <td>${minimoCell}</td>
                <td>R$ ${Number(p.preco_custo || 0).toFixed(2)}</td>
                <td>R$ ${Number(p.preco_venda || 0).toFixed(2)}</td>
                <td class="truncate" title="${fornecedor}">${fornecedor}</td>
                ${window.actMenu(acoes)}
            </tr>`;
        }).join('');

        tbody.querySelectorAll('td[data-produto-id]').forEach(td => {
            td.addEventListener('click', async () => {
                const p = await window.ngr.produtos.get(Number(td.dataset.produtoId));
                this.openForm(p);
            });
        });
        tbody.querySelectorAll('.btn-editar-prod').forEach(btn => {
            btn.addEventListener('click', async () => {
                const p = await window.ngr.produtos.get(Number(btn.dataset.id));
                this.openForm(p);
            });
        });
        tbody.querySelectorAll('.btn-movimento').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openMovimento(Number(btn.dataset.id), btn.dataset.nome, btn.dataset.tipo);
            });
        });
        tbody.querySelectorAll('.btn-historico').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.openHistorico(Number(btn.dataset.id), btn.dataset.nome);
            });
        });
        tbody.querySelectorAll('.btn-excluir-prod').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir este produto?')) return;
                await window.ngr.produtos.remove(Number(btn.dataset.id));
                window.showToast('Produto removido', 'info');
                this.load();
            });
        });

        this.updateLowStockBanner(data);
    }

    updateLowStockBanner(data) {
        const banner = document.getElementById('estoque-baixo-banner');
        const low = data.filter(p => p.tipo !== 'servico' && p.estoque_atual <= p.estoque_minimo);
        if (low.length === 0) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
            return;
        }
        banner.classList.remove('hidden');
        banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>${low.length}</strong> produto${low.length > 1 ? 's' : ''} com estoque abaixo do minimo. Clique para ajustar: ` +
            low.map(p => `<button type="button" class="btn btn-link btn-sm banner-prod-ajuste" data-id="${p.id}" data-nome="${p.nome}">${p.nome}</button>`).join(' ');
        banner.querySelectorAll('.banner-prod-ajuste').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openMovimento(Number(btn.dataset.id), btn.dataset.nome, 'ajuste');
            });
        });
    }

    async openForm(dados) {
        this.editId = dados?.id || null;
        document.getElementById('produto-modal-title').textContent = this.editId ? 'Editar Produto' : 'Novo Produto';
        document.getElementById('prod-nome').value = dados?.nome || '';
        document.getElementById('prod-sku').value = dados?.sku || '';
        document.getElementById('prod-codigo-barras').value = dados?.codigo_barras || '';
        document.getElementById('prod-ncm').value = dados?.ncm || '';
        document.getElementById('prod-unidade').value = dados?.unidade || 'un';
        document.getElementById('prod-tipo').value = dados?.tipo || 'produto';
        document.getElementById('prod-descricao').value = dados?.descricao || '';
        document.getElementById('prod-preco-custo').value = dados?.preco_custo || '';
        document.getElementById('prod-preco-venda').value = dados?.preco_venda || '';
        document.getElementById('prod-preco-minimo').value = dados?.preco_minimo || '';
        document.getElementById('prod-estoque-atual').value = dados?.estoque_atual || '';
        document.getElementById('prod-estoque-minimo').value = dados?.estoque_minimo || '';
        document.getElementById('prod-estoque-maximo').value = dados?.estoque_maximo || '';
        document.getElementById('prod-ativo').checked = dados ? !!dados.ativo : true;
        document.getElementById('prod-preco-sugerido').textContent = '';
        this.toggleTipoFields();

        const [categorias, fornecedores] = await Promise.all([
            window.ngr.categorias.list(),
            window.ngr.fornecedores.list({}),
        ]);
        const catSel = document.getElementById('prod-categoria');
        catSel.innerHTML = '<option value="">Selecione</option>' +
            categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        if (dados?.categoria_id) catSel.value = dados.categoria_id;

        const fornSel = document.getElementById('prod-fornecedor');
        fornSel.innerHTML = '<option value="">Proprio (sem fornecedor)</option>' +
            fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        if (dados?.fornecedor_id) fornSel.value = dados.fornecedor_id;

        document.getElementById('produto-modal').classList.remove('hidden');
    }

    closeForm() {
        document.getElementById('produto-modal').classList.add('hidden');
        this.editId = null;
    }

    async calcularPreco() {
        const produto = {
            preco_custo: parseFloat(document.getElementById('prod-preco-custo').value) || 0,
        };
        try {
            const result = await window.ngr.precificacao.calcular(produto);
            const span = document.getElementById('prod-preco-sugerido');
            if (result && result.preco_sugerido) {
                span.textContent = `Sugerido: R$ ${Number(result.preco_sugerido).toFixed(2)}`;
                document.getElementById('prod-preco-venda').value = result.preco_sugerido;
            } else if (typeof result === 'number') {
                span.textContent = `Sugerido: R$ ${result.toFixed(2)}`;
                document.getElementById('prod-preco-venda').value = result;
            } else {
                span.textContent = 'Nao foi possivel calcular';
            }
        } catch (e) {
            window.showToast('Erro ao calcular preco sugerido', 'error');
        }
    }

    async saveProduto() {
        const tipo = document.getElementById('prod-tipo').value === 'servico' ? 'servico' : 'produto';
        const dados = {
            nome: document.getElementById('prod-nome').value.trim(),
            sku: document.getElementById('prod-sku').value.trim() || null,
            codigo_barras: document.getElementById('prod-codigo-barras').value.trim() || null,
            ncm: document.getElementById('prod-ncm').value.trim() || null,
            unidade: document.getElementById('prod-unidade').value,
            tipo,
            descricao: document.getElementById('prod-descricao').value.trim() || null,
            preco_custo: parseFloat(document.getElementById('prod-preco-custo').value) || 0,
            preco_venda: parseFloat(document.getElementById('prod-preco-venda').value) || 0,
            preco_minimo: parseFloat(document.getElementById('prod-preco-minimo').value) || 0,
            estoque_atual: tipo === 'servico' ? 0 : (parseFloat(document.getElementById('prod-estoque-atual').value) || 0),
            estoque_minimo: tipo === 'servico' ? 0 : (parseFloat(document.getElementById('prod-estoque-minimo').value) || 0),
            estoque_maximo: tipo === 'servico' ? 0 : (parseFloat(document.getElementById('prod-estoque-maximo').value) || 0),
            categoria_id: parseInt(document.getElementById('prod-categoria').value) || null,
            fornecedor_id: parseInt(document.getElementById('prod-fornecedor').value) || null,
            ativo: document.getElementById('prod-ativo').checked,
        };
        if (!dados.nome) {
            window.showToast('Informe o nome do produto', 'error');
            return;
        }
        if (this.editId) {
            await window.ngr.produtos.update(this.editId, dados);
            window.showToast('Produto atualizado', 'success');
        } else {
            await window.ngr.produtos.create(dados);
            window.showToast('Produto criado', 'success');
        }
        this.closeForm();
        this.load();
    }

    openMovimento(produtoId, nomeProduto, tipo) {
        this.movProdutoId = produtoId;
        this.movTipo = tipo;
        const labels = { entrada: 'Entrada - Adicionar Estoque', saida: 'Saida - Remover Estoque', ajuste: 'Ajuste - Definir Quantidade' };
        document.getElementById('movimento-modal-title').textContent = labels[tipo] || 'Movimentar';
        document.getElementById('movimento-produto-info').textContent = `Produto: ${nomeProduto}`;
        window.ngr.produtos.get(produtoId).then(p => {
            if (p && p.tipo === 'servico') {
                window.showToast('Servico nao controla estoque', 'info');
                return;
            }
        });
        document.getElementById('movimento-qtd').value = '';
        document.getElementById('movimento-obs').value = '';
        document.getElementById('movimento-doc').value = '';
        const docGroup = document.getElementById('movimento-doc-group');
        if (tipo === 'entrada') {
            docGroup.classList.remove('hidden');
            document.getElementById('movimento-qtd-label').textContent = 'Quantidade (+)';
        } else if (tipo === 'saida') {
            docGroup.classList.remove('hidden');
            document.getElementById('movimento-qtd-label').textContent = 'Quantidade (-)';
        } else {
            docGroup.classList.add('hidden');
            document.getElementById('movimento-qtd-label').textContent = 'Nova Quantidade';
        }
        document.getElementById('movimento-modal').classList.remove('hidden');
        document.getElementById('movimento-qtd').focus();
    }

    closeMovimento() {
        document.getElementById('movimento-modal').classList.add('hidden');
        this.movProdutoId = null;
        this.movTipo = null;
    }

    async confirmMovimento() {
        const qtd = parseFloat(document.getElementById('movimento-qtd').value);
        const obs = document.getElementById('movimento-obs').value.trim() || null;
        const doc = document.getElementById('movimento-doc').value.trim() || null;
        if (isNaN(qtd) || qtd < 0) {
            window.showToast('Informe uma quantidade valida', 'error');
            return;
        }
        const finalObs = doc ? `${obs ? obs + ' | ' : ''}Doc: ${doc}` : obs;
        await window.ngr.produtos.movimentar(this.movProdutoId, this.movTipo, qtd, finalObs, doc);
        window.showToast('Movimentacao registrada', 'success');
        this.closeMovimento();
        this.load();
    }

    async openHistorico(produtoId, nomeProduto) {
        document.getElementById('historico-modal-title').textContent = `Movimentos - ${nomeProduto}`;
        const tbody = document.getElementById('historico-tbody');
        const empty = document.getElementById('historico-empty');
        try {
            const movimentos = await window.ngr.produtos.movimentos(produtoId);
            if (!movimentos.length) {
                tbody.innerHTML = '';
                empty.classList.remove('hidden');
            } else {
                empty.classList.add('hidden');
                tbody.innerHTML = movimentos.map(m => {
                    const tipoClass = { entrada: 'text-success', saida: 'text-danger', ajuste: 'text-info', perda: 'text-warning' }[m.tipo] || '';
                    const sinal = m.tipo === 'entrada' ? '+' : (m.tipo === 'saida' || m.tipo === 'perda' ? '-' : '');
                    return `<tr>
                        <td>${m.created_at ? m.created_at.slice(0, 16) : '-'}</td>
                        <td class="${tipoClass} fw-bold">${m.tipo}</td>
                        <td>${sinal}${Number(m.quantidade).toFixed(3)}</td>
                        <td>${m.saldo_resultante != null ? Number(m.saldo_resultante).toFixed(3) : '-'}</td>
                        <td class="truncate" title="${m.observacao || ''}">${m.observacao || '-'}</td>
                        <td>${m.documento || '-'}</td>
                    </tr>`;
                }).join('');
            }
        } catch (e) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            empty.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar historico</p>';
        }
        document.getElementById('historico-modal').classList.remove('hidden');
    }

    closeHistorico() {
        document.getElementById('historico-modal').classList.add('hidden');
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Estoque;
