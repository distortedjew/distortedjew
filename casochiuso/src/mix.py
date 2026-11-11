import json, numpy as np, soundfile as sf, subprocess
SR=48000
T=json.load(open('src/timeline.json')); D=T['duration']+2.5
N=int(D*SR)
v,vsr=sf.read('assets/audio/voice.wav'); v=v.astype(np.float32)
v=np.interp(np.arange(int(len(v)*SR/vsr))/(SR/vsr),np.arange(len(v)),v).astype(np.float32)
voice=np.zeros(N,np.float32); voice[:len(v)]=v[:N]; voice*=0.95/np.max(np.abs(voice))
# duck envelope from voice
env=np.abs(voice); k=int(SR*0.25); env=np.convolve(env,np.ones(k)/k,mode='same')
env=np.clip(env/0.08,0,1); k2=int(SR*0.4); env=np.convolve(env,np.ones(k2)/k2,mode='same')
duck=1-0.62*env
CH={'Am':[110,164.8,220,261.6,329.6],'F':[87.3,174.6,220,261.6,349.2],'Dm':[73.4,146.8,220,293.7,349.2],'E':[82.4,164.8,246.9,329.6,415.3],'C':[65.4,130.8,196,261.6,329.6],'G':[98,196,246.9,293.7,392]}
SEQ={'c0':['Am','F'],'brand':['Am'],'c1':['Am','F','Am','E'],'c2':['Dm','Am','Dm','E'],'c3':['F','C','Am','E'],'c4':['Dm','Am','F','E'],'c5':['E','Am','E','Am'],'c6':['Dm','E','Am','E'],'c7':['C','G','Am','F'],'c8':['Am','F','C','G'],'c9':['Dm','Am','F','C']}
segs=[]  # (t0,t1,chord)
for ch in T['chapters']:
    seq=SEQ[ch['id']]; t=ch['start']; end=ch['end']; i=0
    while t<end-0.5:
        t1=min(end,t+10); segs.append((t,t1,seq[i%len(seq)])); t=t1; i+=1
segs.append((T['chapters'][-1]['end'],D,'C'))
segs[-2]=(segs[-2][0],segs[-2][1],segs[-2][2])
rng=np.random.default_rng(7)
music=np.zeros(N,np.float32)
fade=2.5
for (a,b,name) in segs:
    s0=int(max(0,(a-fade/2))*SR); s1=int(min(D,(b+fade/2))*SR); n=s1-s0
    t=np.arange(n)/SR
    seg=np.zeros(n,np.float32)
    for j,f in enumerate(CH[name]):
        vib=1+0.0025*np.sin(2*np.pi*(0.13+0.04*j)*t+j)
        ph=2*np.pi*np.cumsum(f*vib)/SR
        amp=0.5 if j==0 else 0.28
        seg+=amp*(np.sin(ph)+0.35*np.sin(2*ph)+0.12*np.sin(3*ph)+0.18*np.sin(ph*1.003))
    w=np.ones(n,np.float32); fn=int(fade*SR)
    w[:fn]=np.linspace(0,1,fn); w[-fn:]=np.linspace(1,0,fn)
    if a<=0.1: w[:fn]=1
    music[s0:s1]+=seg*w
# slow swell + breath
tt=np.arange(N)/SR
music*=0.75+0.25*np.sin(2*np.pi*tt/17)
# tension pulse in c5,c6,c9 end
for cid,lvl in (('c5',0.20),('c6',0.22)):
    ch=[c for c in T['chapters'] if c['id']==cid][0]
    a=int(ch['start']*SR); b=int(ch['end']*SR); n=b-a; t=np.arange(n)/SR
    beat=(np.sin(2*np.pi*1.0*t)>0.9).astype(np.float32); beat=np.convolve(beat,np.ones(int(SR*.12))/(SR*.12),mode='same')
    music[a:b]+=lvl*np.sin(2*np.pi*55*t)*beat
# air noise
noise=rng.standard_normal(N).astype(np.float32); k=int(SR/800); noise=np.convolve(noise,np.ones(k)/k,mode='same')
music+=0.02*noise*(0.5+0.5*np.sin(2*np.pi*tt/9))
music/=np.max(np.abs(music)); music*=0.55
# ---- sfx ----
sfx=np.zeros(N,np.float32)
def add(t0,x,g=1.0):
    i=int(t0*SR)
    if i<0 or i>=N: return
    x=x[:N-i]; sfx[i:i+len(x)]+=g*x
def thump(dur=0.5,f0=95):
    t=np.arange(int(dur*SR))/SR; e=np.exp(-t*9)
    x=np.sin(2*np.pi*(f0*np.exp(-t*6)+40)*t)*e
    n=rng.standard_normal(len(t)).astype(np.float32); n=np.convolve(n,np.ones(8)/8,mode='same')*np.exp(-t*40)
    return (x+0.35*n).astype(np.float32)
def whoosh(dur=0.5):
    n=rng.standard_normal(int(dur*SR)).astype(np.float32); t=np.arange(len(n))/SR
    y=np.zeros_like(n); a=0.0
    for i in range(len(n)):
        c=0.02+0.5*np.sin(np.pi*t[i]/dur)**2*0.5; a+=c*(n[i]-a); y[i]=a
    return (y*np.sin(np.pi*t/dur)**1.5*3.2).astype(np.float32)
def click(dur=0.05):
    t=np.arange(int(dur*SR))/SR; n=rng.standard_normal(len(t)).astype(np.float32)
    return (n*np.exp(-t*90)*0.5).astype(np.float32)
def ln(cid,i):
    ch=[c for c in T['chapters'] if c['id']==cid][0]; return ch['lines'][i]
def cue(cid,i,phrase):
    l=ln(cid,i); k=l['text'].find(phrase); k=max(k,0); return l['s']+k/len(l['text'])*(l['e']-l['s'])
TH=thump(); WH=whoosh()
for ch in T['chapters']:
    if ch['title']:
        add(ch['start']+0.05,TH,0.9); add(ch['start']+0.4,click(),0.6); add(ch['start']+3.0,WH,0.5)
add(T['chapters'][1]['start']+1.2,TH,1.0)  # CASO CHIUSO stamp
for cid,i,ph in [('c2',0,'Niente'),('c2',2,'traccia'),('c4',4,'perfettamente'),('c5',3,'Nessuno riesce'),('c7',2,'maschera'),('c8',0,'risposta'),('c9',0,'non ha ancora')]:
    add(cue(cid,i,ph),TH,0.9)
for cid,i,ph in [('c1',4,'qualcuno ha tagliato')]:
    t0=cue(cid,i,ph)
    for k in range(4):
        for m in range(4): add(t0+k*1.1+0.3+m*0.16,click(),0.9)
add(cue('c9',3,'Questo era')+1.8,TH,1.0)
add(cue('c4',4,'Il pezzetto')+0.9,click(),1.0)
for cid in ('c1','c2','c3','c4','c5','c6','c7','c8','c9'):
    pass
sfx*=0.7
mix=voice*1.0+music*duck*0.62+sfx
# soft limiter
mix=np.tanh(mix*1.1)/np.tanh(1.1)
st=np.stack([mix, np.roll(mix,int(SR*0.0004))],axis=1)
sf.write('/tmp/mix_raw.wav',st,SR,subtype='PCM_16')
subprocess.run(['ffmpeg','-y','-loglevel','error','-i','/tmp/mix_raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=385.2:d=3,atrim=0:388.3','-ar','48000','-c:a','pcm_s16le','assets/audio/mix.wav'],check=True)
print('mix ok',D)
