// Impressão universal via Electron — usa a impressão nativa do webContents,
// compatível com qualquer impressora já instalada no SO (Windows/Linux/macOS),
// sem necessidade de drivers específicos no ERP.
const { app } = require('electron');

// Imprime uma string base64 (PDF, imagem) em janela de pré-visualização com
// fallback para impressão silenciosa quando silencioso=true.
async function printDataUrl(dataUrl, options = {}) {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({
        show: false,
        width: 800, height: 1000,
        webPreferences: { sandbox: true },
    });
    // Converte dataUrl (base64) para renderizar via data: URL somente para imagem;
    // para PDF carrega um HTML com <embed> do data:application/pdf.
    const isPdf = /^data:application\/pdf/.test(dataUrl) || /;base64/.test(dataUrl);
    const dataSrc = isPdf
        ? `data:application/pdf;base64,${dataUrl.replace(/^data:application\/pdf;base64,/, '')}`
        : dataUrl;

    await win.loadURL('about:blank');
    await win.webContents.executeJavaScript(`
        document.body.style.margin = '0';
        document.body.innerHTML = ${JSON.stringify(isPdf
            ? `<embed src="${dataSrc}" type="application/pdf" style="width:100vw;height:100vh">`
            : `<img src="${dataSrc}" style="width:100%">`)};
    `);

    // Aguarda o conteúdo carregar
    await new Promise(r => setTimeout(r, options.delay || 400));

    return await new Promise((resolve) => {
        const deviceName = options.deviceName;
        win.webContents.print({
            silent: !!options.silent,
            printBackground: true,
            deviceName,
            landscape: !!options.landscape,
        }, (success, failureReason) => {
            win.destroy();
            resolve({ success, error: failureReason || null });
        });
    });
}

// Imprime um HTML cru (ex.: cupom térmico) na impressora padrão.
async function printHTML(html, options = {}) {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { sandbox: true } });
    const baseHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,Helvetica,sans-serif;color:#000;padding:8px;}
        table{width:100%;border-collapse:collapse;font-size:12px}
        td,th{padding:3px 4px;border-bottom:1px solid #ccc;text-align:left}
        @page{margin:0}
    </style></head><body>${html}</body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(baseHtml));
    await new Promise(r => setTimeout(r, options.delay || 300));
    return await new Promise((resolve) => {
        win.webContents.print({
            silent: !!options.silent,
            printBackground: true,
            deviceName: options.deviceName,
            landscape: !!options.landscape,
        }, (success, failureReason) => {
            win.destroy();
            resolve({ success, error: failureReason || null });
        });
    });
}

module.exports = { printDataUrl, printHTML };
