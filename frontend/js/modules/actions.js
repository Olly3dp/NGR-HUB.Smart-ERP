// Padrao unico de "Menu de Acoes Compacto" (kebab) para todas as tabelas/listas.
// A coluna de acoes tem largura fixa (.act-col) e nunca quebra linhas nem
// desalinha a tabela. Cada acao e um <button class="act-item ..."> dentro de
// um dropdown, mantendo as classes/data-id para os handlers existentes.

export function actItem(o) {
    const cls = o.cls ? ' ' + o.cls : '';
    const danger = o.danger ? ' danger' : '';
    const attrs = o.attrs ? ' ' + o.attrs : '';
    return `<button type="button" class="act-item${cls}${danger}"${attrs}><i class="fas ${o.icon}"></i>${o.label}</button>`;
}

export function actMenu(items, opts = {}) {
    const cls = opts.className ? ' ' + opts.className : '';
    return `<td class="act-col${cls}"><div class="actions-menu">
        <button type="button" class="act-trigger" title="Acoes"><i class="fas fa-ellipsis-v"></i></button>
        <div class="act-menu">${items.join('')}</div>
    </div></td>`;
}

window.actMenu = actMenu;
window.actItem = actItem;

// Dropdown flutuante ("portal") para nao ser cortado pelo overflow das tabelas.
// Ao abrir, o .act-menu ganha position:fixed com coordenadas baseadas na posicao
// real do trigger (getBoundingClientRect). Como nenhum ancestral usa transform/
// filter, um elemento fixed nao e clippado por .table-wrap { overflow-x:auto }.

let currentMenu = null;

function closeMenu() {
    if (currentMenu && currentMenu.isConnected) {
        currentMenu.classList.remove('open');
        currentMenu.style.position = '';
        currentMenu.style.top = '';
        currentMenu.style.left = '';
        currentMenu.style.right = '';
        currentMenu.style.zIndex = '';
    }
    currentMenu = null;
}

function openMenu(menu, trigger) {
    if (currentMenu) closeMenu();
    const rect = trigger.getBoundingClientRect();
    menu.classList.add('open');
    menu.style.position = 'fixed';
    menu.style.zIndex = '500';
    const menuH = menu.offsetHeight;
    const menuW = menu.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - 6;
    if (spaceBelow < menuH) menu.style.top = Math.max(6, rect.top - menuH + 6) + 'px';
    else menu.style.top = (rect.bottom + 4) + 'px';
    let left = rect.right - menuW;
    if (left < 6) left = 6;
    if (left + menuW > window.innerWidth - 6) left = window.innerWidth - menuW - 6;
    menu.style.left = left + 'px';
    currentMenu = menu;
}

// Fase de captura: fecha menus e alterna o trigger ANTES que handlers de linha/td
// (com stopPropagation no bubbling) interfiram.
document.addEventListener('click', (e) => {
    const inMenu = e.target.closest && e.target.closest('.act-menu');
    const trigger = e.target.closest && e.target.closest('.act-trigger');

    if (trigger) {
        e.stopPropagation();
        const holder = trigger.parentElement;
        const menu = holder && holder.querySelector('.act-menu');
        if (currentMenu) {
            if (currentMenu === menu) { closeMenu(); return; }
            closeMenu();
        }
        if (menu) openMenu(menu, trigger);
        return;
    }

    if (!inMenu) closeMenu();
}, true);

// Reancora/descarta o menu ao rolar (item fixed nao acompanha a tabela) ou redimensionar.
window.addEventListener('scroll', () => { if (currentMenu) closeMenu(); }, true);
window.addEventListener('resize', () => { if (currentMenu) closeMenu(); }, true);
