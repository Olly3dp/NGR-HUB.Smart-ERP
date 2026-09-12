// Gráficos 100% SVG/CSS — sem bibliotecas externas (leve e rápido em máquinas modestas).
export const CHART_COLORS = ['var(--primary)', 'var(--blue)', 'var(--green)', 'var(--red)', 'var(--orange)', '#7f8cff', '#00bcd4', '#e91e63', '#8bc34a', '#ff9800'];

function piePath(cx, cy, r, a0, a1) {
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

// Pizza (Pie Chart)
export function pieChart(segments, opts = {}) {
    const size = opts.size || 180;
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    const arr = (segments || []).filter(s => Number(s.value) > 0);
    const total = arr.reduce((s, x) => s + Number(x.value), 0);
    if (!total) return `<div class="chart-empty" style="height:${size}px"><i class="fas fa-chart-pie"></i><p>Sem dados</p></div>`;

    let angle = -Math.PI / 2;
    let arcs = '';
    arr.forEach((seg, i) => {
        const frac = Number(seg.value) / total;
        const a0 = angle;
        const a1 = angle + frac * 2 * Math.PI;
        const color = seg.color || (opts.colors || CHART_COLORS)[i % CHART_COLORS.length];
        arcs += `<path d="${piePath(cx, cy, r, a0, a1)}" fill="${color}" stroke="var(--surface)" stroke-width="1.5" style="filter:drop-shadow(1px 2px 2px rgba(0,0,0,.4))"></path>`;
        angle = a1;
    });

    const totalLabel = opts.totalLabel || 'Total';
    const legend = arr.map((seg, i) => {
        const color = seg.color || (opts.colors || CHART_COLORS)[i % CHART_COLORS.length];
        const pct = Math.round((Number(seg.value) / total) * 100);
        return `<div class="pie-legend-item" style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:.75rem;color:var(--text2)">
            <span class="chart-dot" style="background:${color}"></span>
            <span style="flex:1">${seg.label}</span>
            <b style="color:var(--text1)">${opts.formatter ? opts.formatter(seg.value) : seg.value}</b>
            <span style="font-size:.65rem;color:var(--text2)">${pct}%</span>
        </div>`;
    }).join('');

    return `<div class="pie-wrap" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <svg class="pie-3d" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:0 0 auto">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent"></circle>
            ${arcs}
            <text x="${cx}" y="${Math.round(cy - 4)}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text1)">${totalLabel}</text>
            <text x="${cx}" y="${Math.round(cy + 14)}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--primary)">${total}</text>
        </svg>
        <div class="pie-legend" style="flex:1;min-width:150px">${legend}</div>
    </div>`;
}

// Gráfico em Escadas (Step Line Chart)
let _stepGradId = 0;
export function stepLineChart(points, opts = {}) {
    const w = opts.width || 460, h = opts.height || 180;
    const padX = 14, padTop = 16, padBottom = 26;
    const arr = (points || []).filter(p => p && p.value != null);
    if (!arr.length) return `<div class="chart-empty" style="height:${h}px"><i class="fas fa-chart-line"></i><p>Sem dados</p></div>`;

    const max = Math.max(1, ...arr.map(p => Number(p.value)));
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBottom;
    const step = arr.length > 1 ? innerW / (arr.length - 1) : 0;
    const x = i => padX + (arr.length > 1 ? i * step : innerW / 2);
    const y = v => padTop + innerH - (Number(v) / max) * innerH;

    let path = '';
    arr.forEach((p, i) => {
        if (i === 0) path += `M ${x(i)} ${y(p.value)}`;
        else path += `H ${x(i)} V ${y(p.value)}`;
    });

    // Area fechada abaixo da linha (preenche o "degrau") com gradiente 2.5D.
    let area = `M ${x(0)} ${y(arr[0].value)}`;
    arr.forEach((p, i) => { if (i > 0) area += `H ${x(i)} V ${y(p.value)}`; });
    area += `L ${x(arr.length - 1)} ${h - padBottom} L ${x(0)} ${h - padBottom} Z`;

    const gradId = 'stepGrad' + (++_stepGradId);
    const gradColor = opts.color || 'var(--primary)';

    const dots = arr.map((p, i) => {
        const cor = opts.color || 'var(--primary)';
        return `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="${cor}" stroke="var(--surface)" stroke-width="1.5"></circle>`;
    }).join('');

    const labels = arr.map((p, i) => {
        if (arr.length > 16 && i % 2 !== 0 && i !== arr.length - 1) return '';
        return `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="9" fill="var(--text2)">${p.label}</text>`;
    }).join('');

    const dashArr = arr.map((p) => Math.round(Number(p.value)).toLocaleString('pt-BR')).join(' · ');

    return `<div class="step-wrap">
        <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="max-width:${w}px">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${gradColor}" stop-opacity="0.35"></stop>
                    <stop offset="100%" stop-color="${gradColor}" stop-opacity="0.03"></stop>
                </linearGradient>
            </defs>
            <line x1="${padX}" y1="${padTop}" x2="${padX}" y2="${h - padBottom}" stroke="var(--border)" stroke-width="1"></line>
            <line x1="${padX}" y1="${h - padBottom}" x2="${w - padX}" y2="${h - padBottom}" stroke="var(--border)" stroke-width="1"></line>
            <path class="step-area" d="${area}" fill="url(#${gradId})" ></path>
            <path class="step-line" d="${path}" fill="none" stroke="${gradColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
            ${dots}
            ${labels}
        </svg>
        <div class="step-values" style="font-size:.72rem;color:var(--text2);margin-top:4px">${dashArr}</div>
    </div>`;
}
