class Calendario {
    constructor(container) { this.container = container; this.month = new Date().getMonth(); this.year = new Date().getFullYear(); }

    async init() {
        this.render();
        await this.load();
    }

    render() {
        this.container.innerHTML = `
            <div class="flex-between mb-2">
                <div></div>
                <button class="btn btn-primary" id="btn-novo-evento"><i class="fas fa-plus"></i> Novo Evento</button>
            </div>
            <div class="card">
                <div class="calendar-nav">
                    <button class="btn btn-ghost btn-sm" id="cal-prev"><i class="fas fa-chevron-left"></i></button>
                    <h3 id="cal-title"></h3>
                    <button class="btn btn-ghost btn-sm" id="cal-next"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="calendar-grid" id="cal-grid"></div>
            </div>
            <div class="card mt-2">
                <div class="card-header"><h3>Eventos do Dia</h3></div>
                <div id="cal-eventos"></div>
            </div>
            <div id="evento-modal" class="modal-overlay hidden">
                <div class="modal">
                    <h3 id="evento-modal-title">Novo Evento</h3>
                    <div class="form-group"><label>Titulo</label><input class="form-control" id="evento-titulo"></div>
                    <div class="form-group"><label>Tipo</label><select class="form-control" id="evento-tipo"><option value="evento">Evento</option><option value="reuniao">Reuniao</option><option value="aniversario">Aniversario</option><option value="feriado">Feriado</option><option value="lembrete">Lembrete</option></select></div>
                    <div class="form-group"><label>Data</label><input class="form-control" id="evento-data" type="date"></div>
                    <div class="form-group"><label>Descricao</label><textarea class="form-control" id="evento-descricao" rows="3"></textarea></div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" id="evento-cancel">Cancelar</button>
                        <button class="btn btn-primary" id="evento-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('cal-prev').addEventListener('click', () => { this.month--; if (this.month < 0) { this.month = 11; this.year--; } this.load(); });
        document.getElementById('cal-next').addEventListener('click', () => { this.month++; if (this.month > 11) { this.month = 0; this.year++; } this.load(); });
        document.getElementById('btn-novo-evento').addEventListener('click', () => this.openEventForm());
        document.getElementById('evento-cancel').addEventListener('click', () => this.closeEventForm());
        document.getElementById('evento-save').addEventListener('click', () => this.saveEvent());
    }

    async load() {
        const meses = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        document.getElementById('cal-title').textContent = `${meses[this.month]} ${this.year}`;

        const firstDay = new Date(this.year, this.month, 1).getDay();
        const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
        const today = new Date();

        // Fetch events for this month
        const inicio = `${this.year}-${String(this.month + 1).padStart(2, '0')}-01`;
        const fim = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${daysInMonth}`;
        const eventos = await window.ngr.eventos.list({ inicio, fim });
        const contas = await window.ngr.contas.list();

        const eventMap = {};
        contas.filter(c => c.status === 'pendente').forEach(c => {
            const key = c.data_vencimento;
            if (!eventMap[key]) eventMap[key] = [];
            eventMap[key].push({ tipo: 'vencimento', titulo: c.descricao, id: c.id });
        });
        eventos.forEach(e => {
            const key = e.data_inicio;
            if (!eventMap[key]) eventMap[key] = [];
            eventMap[key].push({ tipo: e.tipo, titulo: e.titulo, id: e.id });
        });

        const grid = document.getElementById('cal-grid');
        grid.innerHTML = '';
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        diasSemana.forEach(d => { const h = document.createElement('div'); h.className = 'calendar-day-header'; h.textContent = d; grid.appendChild(h); });

        for (let i = 0; i < firstDay; i++) { const d = document.createElement('div'); d.className = 'calendar-day other-month'; grid.appendChild(d); }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const d = document.createElement('div');
            d.className = 'calendar-day';
            if (today.getFullYear() === this.year && today.getMonth() === this.month && today.getDate() === day) d.classList.add('today');
            d.innerHTML = `<span class="day-num">${day}</span>`;
            const evs = eventMap[dateStr];
            if (evs) {
                const wrap = document.createElement('div');
                wrap.className = 'day-events';
                evs.slice(0, 3).forEach(e => {
                    const dot = document.createElement('span');
                    dot.className = 'event-dot ' + e.tipo;
                    dot.title = e.titulo;
                    wrap.appendChild(dot);
                });
                d.appendChild(wrap);
            }
            d.addEventListener('click', () => this.showDayEvents(dateStr));
            grid.appendChild(d);
        }

        this.selectedDate = null;
        document.getElementById('cal-eventos').innerHTML = '<div class="empty-state"><p>Clique em um dia para ver os eventos</p></div>';
    }

    async showDayEvents(dateStr) {
        this.selectedDate = dateStr;
        const contas = await window.ngr.contas.list();
        const eventos = await window.ngr.eventos.list();
        const evts = [];
        contas.filter(c => c.status === 'pendente' && c.data_vencimento === dateStr).forEach(c => {
            evts.push({ tipo: 'vencimento', titulo: `${c.descricao} - R$ ${Number(c.valor).toFixed(2)}`, cor: 'vencimento' });
        });
        eventos.filter(e => e.data_inicio === dateStr).forEach(e => {
            evts.push({ tipo: e.tipo, titulo: e.titulo, cor: e.tipo });
        });
        const el = document.getElementById('cal-eventos');
        if (!evts.length) {
            el.innerHTML = '<div class="empty-state"><p>Sem eventos neste dia</p></div>';
        } else {
            el.innerHTML = evts.map(e => `<div class="doc-item"><div class="event-dot ${e.cor}" style="width:10px;height:10px"></div><span>${e.titulo}</span></div>`).join('');
        }
    }

    destroy() { this.container.innerHTML = ''; }

    openEventForm(data) {
        this.editEventId = data?.id || null;
        document.getElementById('evento-modal-title').textContent = this.editEventId ? 'Editar Evento' : 'Novo Evento';
        document.getElementById('evento-titulo').value = data?.titulo || '';
        document.getElementById('evento-tipo').value = data?.tipo || 'evento';
        document.getElementById('evento-data').value = data?.data_inicio || new Date().toISOString().split('T')[0];
        document.getElementById('evento-descricao').value = data?.descricao || '';
        document.getElementById('evento-modal').classList.remove('hidden');
    }

    closeEventForm() {
        document.getElementById('evento-modal').classList.add('hidden');
        this.editEventId = null;
    }

    async saveEvent() {
        const titulo = document.getElementById('evento-titulo').value.trim();
        if (!titulo) { window.showToast('Informe o titulo', 'error'); return; }
        const dados = {
            titulo,
            tipo: document.getElementById('evento-tipo').value,
            data_inicio: document.getElementById('evento-data').value,
            descricao: document.getElementById('evento-descricao').value.trim() || null,
        };
        if (this.editEventId) {
            // eventos don't have update in this API, so we remove+create
            await window.ngr.eventos.remove(this.editEventId);
        }
        await window.ngr.eventos.create(dados);
        window.showToast('Evento salvo', 'success');
        this.closeEventForm();
        this.load();
    }
}
export default Calendario;
