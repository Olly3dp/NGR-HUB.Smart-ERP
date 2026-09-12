class WhatsApp {
    constructor(container) {
        this.container = container;
        this.webview = null;
        this.ready = false;
    }

    async init() {
        this.container.innerHTML = '';
        await window.ngr.ngrbot.open();
        this.renderLoading();
        window.ngr.ngrbot.status().then((s) => {
            this.ready = !!s.running;
        });
        window.ngr.ngrbot.onStatus((s) => {
            this.ready = !!s.running;
            if (s.running) this.buildWebview();
        });
        setTimeout(() => this.buildWebview(), 1200);
    }

    renderLoading() {
        this.container.innerHTML = `
            <div class="wa-loading">
                <i class="fab fa-whatsapp"></i>
                <p>Inicializando módulo WhatsApp...</p>
                <div class="wa-spinner"></div>
            </div>
        `;
    }

    buildWebview() {
        if (!this.container || this.webview) return;
        const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        this.container.innerHTML = `
            <div class="wa-frame">
                <webview id="ngrbot-webview" src="http://localhost:3000/dashboard?theme=${theme}"
                    style="width:100%;height:100%;border:none;"></webview>
            </div>
        `;
        this.webview = this.container.querySelector('webview');
        this.webview.addEventListener('did-fail-load', () => {
            setTimeout(() => { try { this.webview.reload(); } catch (e) {} }, 2000);
        });
    }

    async load() {
        if (this.webview) return;
        this.buildWebview();
    }

    destroy() {
        if (this.webview) {
            try { this.webview.stop(); } catch (e) {}
 
            this.webview = null;
        }
        this.container.innerHTML = "";
    }
}

export default WhatsApp;
