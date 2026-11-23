# Нарізка one-shot звуків із генерацій Suno: моно, тиша зрізана, фейд, пік -1 dB.
# Спершу знайти удари: python scripts/cut_sfx.py --analyze <файл>
# Потім вирізати: python scripts/cut_sfx.py <файл> <префікс_виходу> 0.07,0.95,1.15
import sys, numpy as np, soundfile as sf
def analyze():
    d, sr = sf.read(sys.argv[2], always_2d=True)
    m = np.abs(d).max(axis=1)
    print('sr', sr, 'ch', d.shape[1], 'dur %.2f' % (len(d)/sr), 'peak %.3f' % m.max())
    win = int(sr*0.01)
    env = np.array([m[i:i+win].max() for i in range(0, len(m), win)])
    thr = m.max()*0.15
    # onsets: rising above thr after >=60ms below
    on=[]; below=6
    for i,v in enumerate(env):
        if v>thr and below>=6: on.append(i)
        below = below+1 if v<thr*0.5 else 0
    for i in on:
        seg=env[i:i+40]
        print('onset %.3fs peak %.3f  ' % (i*0.01, seg.max()) + ''.join('#' if x>m.max()*0.5 else '+' if x>m.max()*0.1 else '.' if x>m.max()*0.01 else ' ' for x in seg))

if sys.argv[1] == '--analyze':
    analyze(); sys.exit()
src, out = sys.argv[1], sys.argv[2]; onsets=[float(x) for x in sys.argv[3].split(',')]
d, sr = sf.read(src, always_2d=True)
mono = d.mean(axis=1)
for k,t in enumerate(onsets,1):
    a = max(0, int((t-0.02)*sr))
    nxt = onsets[k] if k < len(onsets) else t+0.4
    seg = mono[a:int((nxt-0.015)*sr)]
    # precise attack: first sample above 5% of local peak, start 3 ms before
    pk = np.abs(seg).max(); i0 = np.argmax(np.abs(seg) > pk*0.05)
    seg = seg[max(0,i0-int(0.003*sr)):]
    clip = int((np.abs(seg) > 0.99).sum())
    # end: last 5ms window above -40 dB of peak
    w=int(0.005*sr); env=np.array([np.abs(seg[j:j+w]).max() for j in range(0,len(seg),w)])
    last = np.where(env > pk*0.01)[0]; end = min(len(seg), (last[-1]+1)*w if len(last) else len(seg))
    seg = seg[:end].copy()
    f = min(len(seg)//3, int(0.015*sr)); seg[-f:] *= np.linspace(1,0,f)**2
    seg[:int(0.001*sr)] *= np.linspace(0,1,int(0.001*sr))
    seg *= 0.89/np.abs(seg).max()   # peak -1 dBFS
    p = f'{out}_{k}.mp3'; sf.write(p, seg, sr, format='MP3')
    print(p, 'len %d ms' % (len(seg)*1000//sr), 'clipped samples in source', clip)
