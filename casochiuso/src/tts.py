import json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
K='/tmp/claude-0/-home-user-distortedjew/1fe718a4-3216-528b-afc1-ea8fd4d95cb8/scratchpad/kokoro/'
k=Kokoro(K+'kokoro-v1.0.onnx',K+'voices-v1.0.bin')
d=json.load(open('src/script.json'))
SR=24000; out=[]; t=0.0; tl=[]
def add_silence(s):
    global t
    out.append(np.zeros(int(SR*s),dtype=np.float32)); t+=s
add_silence(0.25)
for c in d['chapters']:
    ch={'id':c['id'],'title':c['title'],'start':t,'lines':[]}
    if c['title']: add_silence(3.4)
    ch['voice_start']=t
    for i,line in enumerate(c['lines']):
        a,sr=k.create(line,voice='im_nicola',speed=0.93,lang='it')
        assert sr==SR
        a=a.astype(np.float32)
        ch['lines'].append({'text':line,'s':round(t,3),'e':round(t+len(a)/SR,3)})
        out.append(a); t+=len(a)/SR
        add_silence(0.7 if i<len(c['lines'])-1 else 0.9)
    ch['end']=round(t,3)
    tl.append(ch); print(c['id'],round(ch['start'],1),round(t,1),flush=True)
add_silence(2.5)
y=np.concatenate(out); sf.write('assets/audio/voice.wav',y,SR)
json.dump({'duration':round(t,3),'chapters':tl},open('src/timeline.json','w'),ensure_ascii=False,indent=1)
print('TOTAL',t)
