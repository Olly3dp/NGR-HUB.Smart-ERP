import { pieChart, stepLineChart } from './charts.js';

class Dashboard {
    constructor(container) { this.container = container; }

    async init() {
        this.destroy();
        await this.load();
    }

    async load() {
        await this.render();
    }

    async render() {
        const ordem = await (window.carregarBlocosAtivos ? window.carregarBlocosAtivos() : Promise.resolve(window.TODOS_BLOCOS || []));

        const resumo = await window.ngr.contas.resumo();
        const contasPend = await window.ngr.contas.list();
        const tarefasPend = await window.ngr.tarefas.list();
        const hojeDate = new Date();
        const hojeStr = hojeDate.toISOString().split('T')[0];

        const [vendas, produtos, clientes, vendasAnual] = await Promise.all([
            window.ngr.vendas.list({ data_inicio: `${hojeDate.getFullYear()}-${String(hojeDate.getMonth()+1).padStart(2,'0')}-01` }),
            window.ngr.produtos.list({ ativo: 1 }),
            window.ngr.clientes.list(),
            window.ngr.vendas.resumo(12).catch(() => ({ mensal: [] })),
        ]);

        const contasAtrasadas = contasPend.filter(c => c.status !== 'pago' && c.status !== 'cancelado' && c.data_vencimento < hojeStr);
        const contasPendentes = contasPend.filter(c => c.status !== 'pago' && c.status !== 'cancelado' && c.data_vencimento >= hojeStr);
        const tarefasFiltradas = tarefasPend.filter(t => t.status !== 'cancelada');

        const diasSemana = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'];
        const meses = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const diaSem = diasSemana[hojeDate.getDay()];
        const dia = hojeDate.getDate();
        const mes = meses[hojeDate.getMonth()];
        const ano = hojeDate.getFullYear();
        const hora = hojeDate.getHours();
        const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

        const primeiroDia = new Date(ano, hojeDate.getMonth(), 1).getDay();
        const ultimoDia = new Date(ano, hojeDate.getMonth() + 1, 0).getDate();
        const diasHeader = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        let calCells = '';
        for (let i = 0; i < primeiroDia; i++) calCells += '<div></div>';
        for (let d = 1; d <= ultimoDia; d++) {
            calCells += '<div class="' + (d === dia ? 'cal-hoje' : '') + '">' + d + '</div>';
        }

        const totalReceitas = contasPend.filter(c => c.tipo === 'receita').reduce((s, c) => s + Number(c.valor), 0);
        const totalDespesas = contasPend.filter(c => c.tipo === 'despesa').reduce((s, c) => s + Number(c.valor), 0);
        const totalContas = totalReceitas + totalDespesas;

        const tPend = tarefasFiltradas.filter(t => t.status === 'pendente').length;
        const tAnd = tarefasFiltradas.filter(t => t.status === 'andamento').length;
        const tConc = tarefasFiltradas.filter(t => t.status === 'concluida').length;
        const totalTarefas = tPend + tAnd + tConc;

        function donut(segments, size, stroke) {
            size = size || 70; stroke = stroke || 8;
            const r = (size - stroke) / 2;
            const cx = size / 2, cy = size / 2;
            const circ = 2 * Math.PI * r;
            let offset = 0;
            let svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
            svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--bg3)" stroke-width="' + stroke + '"/>';
            for (const s of segments) {
                const len = (s.val / (s.total || 1)) * circ;
                svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.cor + '" stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + circ + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + '"/>';
                offset += len;
            }
            svg += '</svg>';
            return svg;
        }

        const segContas = [];
        if (totalContas > 0) {
            if (totalReceitas > 0) segContas.push({ val: totalReceitas, total: totalContas, cor: 'var(--green)', label: 'Receitas' });
            if (totalDespesas > 0) segContas.push({ val: totalDespesas, total: totalContas, cor: 'var(--red)', label: 'Despesas' });
        }
        const segTarefas = [];
        if (totalTarefas > 0) {
            if (tPend > 0) segTarefas.push({ val: tPend, total: totalTarefas, cor: 'var(--orange)', label: 'Pendentes' });
            if (tAnd > 0) segTarefas.push({ val: tAnd, total: totalTarefas, cor: 'var(--blue)', label: 'Andamento' });
            if (tConc > 0) segTarefas.push({ val: tConc, total: totalTarefas, cor: 'var(--green)', label: 'Concluidas' });
        }

        const statusBadges = [
            contasAtrasadas.length > 0
                ? '<span class="status-badge atrasado">' + contasAtrasadas.length + ' conta(s) atrasada(s)</span>'
                : '<span class="status-badge pago">Tudo em dia</span>',
            contasPendentes.length > 0 ? '<span class="status-badge pendente">' + contasPendentes.length + ' a vencer</span>' : '',
            tPend > 0 ? '<span class="status-badge andamento">' + tPend + ' tarefa(s)</span>' : ''
        ].filter(Boolean).join(' ');

        const vendasMes = vendas.reduce(function(s, v) { return s + Number(v.total_final || 0); }, 0);
        const estoqueBaixo = produtos.filter(function(p) { return p.tipo !== 'servico' && p.estoque_atual <= p.estoque_minimo; });

        const mesAtual = hojeStr.slice(0, 7);
        const despesasMes = contasPend
            .filter(function(c) { return c.tipo === 'despesa' && c.status !== 'cancelado' && String(c.data_vencimento || '').slice(0, 7) === mesAtual; })
            .reduce(function(s, c) { return s + Number(c.valor); }, 0);
        const lucroMes = Math.max(0, vendasMes - despesasMes);

        const stepDados = (vendasAnual && vendasAnual.mensal && vendasAnual.mensal.length)
            ? vendasAnual.mensal.map(function(m) { return { label: m.mes, value: Number(m.total || 0) }; })
            : [];

        const blocosHtml = {
            dashboard: () => {
                const dSize = estiloDonut === '2' ? 100 : estiloDonut === '3' ? 85 : 70;
                const dStroke = estiloDonut === '2' ? 10 : estiloDonut === '3' ? 9 : 8;
                const dClass = 'donut-style-' + estiloDonut;

                function donutRow(html, labelsHtml) {
                    if (estiloDonut === '1') {
                        return `<div class="donut-item">${html}${labelsHtml}</div>`;
                    }
                    return `<div class="donut-row">${html}<div class="donut-labels-right">${labelsHtml.replace(/<span/g, '<span style="display:block;margin:2px 0"')}</div></div>`;
                }

                const donutContasHtml2 = totalContas > 0
                    ? donut(segContas, dSize, dStroke) + '<div class="donut-labels">' + segContas.map(function(s) { return '<span style="color:' + s.cor + '">\u25CF ' + s.label + '</span>'; }).join('') + '</div>'
                    : '<div class="donut-empty" style="width:' + dSize + 'px;height:' + dSize + 'px">-</div>';

                const donutTarefasHtml2 = totalTarefas > 0
                    ? donut(segTarefas, dSize, dStroke) + '<div class="donut-labels">' + segTarefas.map(function(s) { return '<span style="color:' + s.cor + '">\u25CF ' + s.label + '</span>'; }).join('') + '</div>'
                    : '<div class="donut-empty" style="width:' + dSize + 'px;height:' + dSize + 'px">-</div>';

                if (estiloDonut === '1') {
                    return `
                        <div class="grid-3 mb-2">
                            <div class="card status-block">
                                <div class="status-block-top"><span class="status-block-saudacao">${saudacao}!</span><span class="status-block-dia">${diaSem}</span></div>
                                <div class="status-block-data">${dia} de ${mes} de ${ano}</div>
                                <div class="status-block-resumo">${statusBadges}</div>
                            </div>
                            <div class="card donuts-card ${dClass}">
                                <div class="donut-item">${donutContasHtml2}</div>
                                <div class="donut-divider"></div>
                                <div class="donut-item">${donutTarefasHtml2}</div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="grid-3 mb-2">
                        <div class="card status-block">
                            <div class="status-block-top"><span class="status-block-saudacao">${saudacao}!</span><span class="status-block-dia">${diaSem}</span></div>
                            <div class="status-block-data">${dia} de ${mes} de ${ano}</div>
                            <div class="status-block-resumo">${statusBadges}</div>
                        </div>
                        <div class="card donuts-card ${dClass}">
                            <div class="donut-row">${donut(segContas, dSize, dStroke)}<div class="donut-labels-right">${segContas.length ? segContas.map(function(s) { return '<span style="color:' + s.cor + '"><span class="donut-dot"></span> ' + s.label + '</span>'; }).join('') : '<span class="donut-empty-label">-</span>'}</div></div>
                            <div class="donut-row-divider"></div>
                            <div class="donut-row">${donut(segTarefas, dSize, dStroke)}<div class="donut-labels-right">${segTarefas.length ? segTarefas.map(function(s) { return '<span style="color:' + s.cor + '"><span class="donut-dot"></span> ' + s.label + '</span>'; }).join('') : '<span class="donut-empty-label">-</span>'}</div></div>
                        </div>
                    </div>
                `;
            },
            calendario: () => `
                <div class="card micro-calendario mb-2">
                    <div class="micro-cal-mes">${mes} ${ano}</div>
                    <div class="micro-cal-grid">${diasHeader.map(function(d) { return '<div class="micro-cal-header">' + d + '</div>'; }).join('')}${calCells}</div>
                </div>
            `,
            contas: () => `
                <div class="grid-4 mb-2">
                    <div class="stat-card danger"><i class="fas fa-exclamation-triangle stat-icon"></i><div class="stat-label">Atrasadas</div><div class="stat-value valor negativo">R$ ${Number(resumo.atrasadas).toFixed(2)}</div></div>
                    <div class="stat-card warning"><i class="fas fa-clock stat-icon"></i><div class="stat-label">A Vencer (7 dias)</div><div class="stat-value valor">R$ ${Number(resumo.vencendo).toFixed(2)}</div></div>
                    <div class="stat-card primary"><i class="fas fa-hourglass-half stat-icon"></i><div class="stat-label">Pendentes</div><div class="stat-value valor">R$ ${Number(resumo.pendentes).toFixed(2)}</div></div>
                    <div class="stat-card success"><i class="fas fa-check-circle stat-icon"></i><div class="stat-label">Pagas este Mes</div><div class="stat-value valor positivo">R$ ${Number(resumo.pagas).toFixed(2)}</div></div>
                </div>
                <div class="card mb-2"><div class="card-header"><h3>Contas Pendentes</h3> <span class="badge">${contasPendentes.length + contasAtrasadas.length}</span></div>
                ${(contasPendentes.length || contasAtrasadas.length)
                    ? '<div class="table-wrap"><table><thead><tr><th>Titulo</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>'
                        + contasAtrasadas.concat(contasPendentes).slice(0, 5).map(function(c) {
                            var statusBadge = c.data_vencimento < hojeStr && c.status !== 'pago' ? 'atrasado' : c.status;
                            return '<tr><td>' + c.descricao + '</td><td class="valor ' + (c.tipo === 'despesa' ? 'negativo' : 'positivo') + '">R$ ' + Number(c.valor).toFixed(2) + '</td><td>' + c.data_vencimento + '</td><td><span class="status-badge ' + statusBadge + '">' + statusBadge + '</span></td></tr>';
                        }).join('') + '</tbody></table></div>'
                    : '<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhuma conta pendente</p></div>'
                }</div>
            `,
            vendas: () => `
                <div class="stat-card success mb-2"><i class="fas fa-shopping-cart stat-icon"></i><div class="stat-label">Vendas (este mes)</div><div class="stat-value valor positivo">R$ ${Number(vendasMes).toFixed(2)}</div></div>
            `,
            estoque: () => `
                <div class="grid-2 mb-2">
                    <div class="stat-card primary"><i class="fas fa-boxes stat-icon"></i><div class="stat-label">Produtos</div><div class="stat-value">${produtos.length}</div></div>
                    <div class="stat-card ${estoqueBaixo.length ? 'danger' : 'success'}"><i class="fas fa-exclamation-triangle stat-icon"></i><div class="stat-label">Estoque Baixo</div><div class="stat-value" style="${estoqueBaixo.length ? 'color:var(--red)' : ''}">${estoqueBaixo.length}</div></div>
                </div>
            `,
            clientes: () => `
                <div class="stat-card primary mb-2"><i class="fas fa-users stat-icon"></i><div class="stat-label">Clientes</div><div class="stat-value">${clientes.length}</div></div>
            `,
            tarefas: () => `
                <div class="card mb-2"><div class="card-header"><h3>Tarefas Pendentes</h3> <span class="badge">${tPend}</span></div>
                ${(tarefasFiltradas.filter(function(t) { return t.status === 'pendente' || t.status === 'andamento'; }).length)
                    ? '<div class="table-wrap"><table><thead><tr><th>Titulo</th><th>Prioridade</th><th>Vencimento</th></tr></thead><tbody>'
                        + tarefasFiltradas.filter(function(t) { return t.status === 'pendente' || t.status === 'andamento'; }).slice(0, 5).map(function(t) {
                            return '<tr><td>' + t.titulo + '</td><td class="prioridade-' + t.prioridade + '">' + t.prioridade + '</td><td>' + (t.data_vencimento || '-') + '</td></tr>';
                        }).join('') + '</tbody></table></div>'
                    : '<div class="empty-state"><i class="fas fa-tasks"></i><p>Nenhuma tarefa pendente</p></div>'
                }</div>
            `,
            pizza: () => `
                <div class="card mb-2">
                    <div class="card-header"><h3><i class="fas fa-chart-pie" style="color:var(--primary)"></i> Vendas e Despesas</h3> <span class="badge">${mes.slice(0,3)}</span></div>
                    <p class="text-muted" style="font-size:.75rem;margin:.2rem 0 .8rem">Comparativo do mês de ${mes} de ${ano}</p>
                    ${pieChart([
                        { label: 'Vendas', value: Math.round(vendasMes) },
                        { label: 'Despesas', value: Math.round(despesasMes) },
                        (lucroMes > 0 ? { label: 'Lucro', value: Math.round(lucroMes) } : null)
                    ].filter(Boolean), { formatter: v => 'R$ ' + Number(v).toLocaleString('pt-BR') })}
                </div>
            `,
            escadas: () => `
                <div class="card mb-2">
                    <div class="card-header"><h3><i class="fas fa-chart-line" style="color:var(--primary)"></i> Vendas em Escadas</h3></div>
                    ${stepLineChart(stepDados)}
                </div>
            `,
        };

        const rawTam = await window.ngr.config.get('dashboard_tamanhos');
        let tamanhos = {};
        if (rawTam) try { tamanhos = JSON.parse(rawTam); } catch {}

        const rawEstilo = await window.ngr.config.get('dashboard_donut_estilo');
        const estiloDonut = rawEstilo || '1';

        const visiveis = ordem.filter(b => blocosHtml[b]);
        const rows = [];
        let currentRow = [];
        for (const b of visiveis) {
            const tam = tamanhos[b] || 'large';
            if (tam === 'large') {
                if (currentRow.length) { rows.push({ blocks: currentRow, small: true }); currentRow = []; }
                rows.push({ blocks: [b], small: false });
            } else {
                currentRow.push(b);
                if (currentRow.length === 2) { rows.push({ blocks: currentRow, small: true }); currentRow = []; }
            }
        }
        if (currentRow.length) rows.push({ blocks: currentRow, small: true });

        function wrapBlock(bloco, html) {
            return `<div class="dash-block-wrap">
                ${html}
            </div>`;
        }

        const h = rows.map(row => {
            if (row.small) {
                return '<div class="grid-' + row.blocks.length + ' mb-2">' + row.blocks.map(b => wrapBlock(b, blocosHtml[b]())).join('') + '</div>';
            }
            return wrapBlock(row.blocks[0], blocosHtml[row.blocks[0]]());
        }).join('\n');
        this.container.innerHTML = h;
    }

    destroy() { this.container.innerHTML = ''; }
}
export default Dashboard;
