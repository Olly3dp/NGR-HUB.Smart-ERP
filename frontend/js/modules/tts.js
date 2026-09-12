class TTSUI {
    constructor() {
        this.enabled = localStorage.getItem('ngr_tts') === 'true';
    }

    speak(text) {
        if (!this.enabled || !window.speechSynthesis) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'pt-BR';
        utter.rate = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const ptVoice = voices.find(v => v.lang.startsWith('pt'));
        if (ptVoice) utter.voice = ptVoice;
        window.speechSynthesis.speak(utter);
    }
}
export default TTSUI;
