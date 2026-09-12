#!/usr/bin/env python3
import sys, json, wave, numpy as np

try:
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    import os
    os.environ['PATH'] = os.path.dirname(ff) + os.pathsep + os.environ.get('PATH', '')
except:
    pass

import whisper

def load_wav(path):
    wf = wave.open(path, 'rb')
    frames = wf.readframes(wf.getnframes())
    dtype = np.int16 if wf.getsampwidth() == 2 else np.int32
    audio = np.frombuffer(frames, dtype=dtype).astype(np.float32) / 32768.0
    wf.close()
    return audio

def transcribe_file(wav_path, lang='pt'):
    model = whisper.load_model('base')
    audio = load_wav(wav_path)
    result = model.transcribe(audio, language=lang, temperature=0.0)
    return result['text'].strip()

if __name__ == '__main__':
    wav_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else 'pt'
    text = transcribe_file(wav_path, lang)
    print(json.dumps({'text': text}))
