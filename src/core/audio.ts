import { platform } from '../platform/platform.ts';
import { save, persist } from './save.ts';

// Спокійний вальс — на мапі, в магазині й меню; зібраніший трек — під час польоту.
// end — де закінчується повна гучність: після неї генератор затухає, і коло там провисало б
export type MusicMode = 'map' | 'level';
const TRACKS: Record<MusicMode, { url: string; end?: number }> = {
  map: { url: 'assets/audio/music.mp3' },
  level: { url: 'assets/audio/music_level.mp3', end: 81.5 },
};
// За скільки секунд один трек перетікає в інший при зміні сцени
const SWITCH_FADE = 1.5;
// Гучність треку відносно шини музики: згенерований трек тихий (пік ~0.3), тож трохи підсилюємо
const TRACK_GAIN = 1.4;
// Скільки секунд кінець кола накладається на початок наступного
const CROSSFADE = 3;
// Записані ефекти (public/assets/audio/sfx/) і їхня гучність; поки файл не завантажився — грає синтез.
// Петля пальника у WAV: MP3-декодер додає тишу на початку, і на стику петлі був би провал
const SFX_FILES: Record<string, [ string, number ]> = {
  click: [ 'click.mp3', 0.3 ],
  burner_loop: [ 'burner_loop.wav', 0.35 ],
  land_soft: [ 'land_soft.mp3', 0.5 ],
  land_hard: [ 'land_hard.mp3', 0.7 ],
  bump: [ 'bump.mp3', 0.45 ],
  pop: [ 'pop.mp3', 0.7 ],
  splash: [ 'splash.mp3', 0.6 ],
  stamp: [ 'stamp.mp3', 0.5 ],
  deliver: [ 'deliver.mp3', 0.55 ],
  star: [ 'star.mp3', 0.5 ],
  win: [ 'win.mp3', 0.55 ],
  coin: [ 'coin.mp3', 0.25 ],
  buy: [ 'buy.mp3', 0.5 ],
};
// Гучність пальника, коли він горить (для синтезу; записана петля підлаштовується під неї)
const BURN_ON = 0.22;

// Тривалість треку без тиші в кінці: генератор лишає кілька секунд тиші, і на них коло б «провисало»
function audibleLength( buf: AudioBuffer ): number
{
  const d = buf.getChannelData( 0 );
  const win = Math.floor( buf.sampleRate / 4 );
  for ( let end = d.length; end - win > 0; end -= win )
  {
    let s = 0;
    for ( let i = end - win; i < end; i++ )
    {
      s += d[ i ] * d[ i ];
    }
    if ( Math.sqrt( s / win ) > 0.008 )
    {
      return end / buf.sampleRate;
    }
  }
  return buf.duration;
}

// Ефекти синтезуються на льоту; музика — згенерований трек, а синтезована петля лишається запасною
class Synth
{
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private musicBus?: GainNode;
  private burnGain?: GainNode;
  private burnSrc?: AudioBufferSourceNode;
  private noise?: AudioBuffer;
  private adMuted = false;
  private musicTimer = 0;
  private nextNote = 0;
  private noteIdx = 0;
  private tracks: Partial<Record<MusicMode, { buf: AudioBuffer; len: number }>> = {};
  private mode: MusicMode = 'map';
  private voice?: GainNode;
  private voiceSrc?: AudioBufferSourceNode;
  private trackTimer = 0;
  private samples: Record<string, AudioBuffer> = {};

  unlock(): void
  {
    if ( !this.ctx )
    {
      const Ctor = window.AudioContext ?? ( window as unknown as { webkitAudioContext: typeof AudioContext } ).webkitAudioContext;
      if ( !Ctor )
      {
        return;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect( this.ctx.destination );
      this.sfx = this.ctx.createGain();
      this.sfx.connect( this.master );
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect( this.master );
      this.noise = this.ctx.createBuffer( 1, this.ctx.sampleRate * 2, this.ctx.sampleRate );
      const d = this.noise.getChannelData( 0 );
      for ( let i = 0; i < d.length; i++ )
      {
        d[ i ] = Math.random() * 2 - 1;
      }
      this.startBurner();
      this.applyVolume();
      this.musicTimer = window.setInterval( () => this.scheduleMusic(), 120 );
      void this.loadTrack();
      void this.loadSamples();
    }
    // iOS відпускає аудіо лише в обробнику дотику, тому resume викликаємо з кожного жесту
    if ( this.ctx.state === 'suspended' )
    {
      void this.ctx.resume();
    }
  }

  get muted(): boolean
  {
    return save().muted || platform.platformMuted() || this.adMuted;
  }

  toggleMute(): void
  {
    save().muted = !save().muted;
    persist();
    this.applyVolume();
  }

  toggleMusic(): void
  {
    save().music = !save().music;
    persist();
    this.applyVolume();
  }

  setAdMuted( m: boolean ): void
  {
    this.adMuted = m;
    this.applyVolume();
  }

  applyVolume(): void
  {
    if ( !this.ctx || !this.master || !this.musicBus )
    {
      return;
    }
    this.master.gain.setTargetAtTime( this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05 );
    this.musicBus.gain.setTargetAtTime( save().music ? 0.32 : 0, this.ctx.currentTime, 0.1 );
  }

  private startBurner(): void
  {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.7;
    this.burnGain = ctx.createGain();
    this.burnGain.gain.value = 0;
    src.connect( bp ).connect( this.burnGain ).connect( this.sfx! );
    src.start();
    this.burnSrc = src;
  }

  // Записана петля замінює синтезований шум; burnGain і далі вмикає та гасить її
  private useBurnerSample( buf: AudioBuffer ): void
  {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = SFX_FILES.burner_loop[ 1 ] / BURN_ON;
    src.connect( g ).connect( this.burnGain! );
    src.start();
    this.burnSrc?.stop();
    this.burnSrc = src;
  }

  burner( on: boolean ): void
  {
    if ( this.ctx && this.burnGain )
    {
      this.burnGain.gain.setTargetAtTime( on ? BURN_ON : 0, this.ctx.currentTime, on ? 0.04 : 0.12 );
    }
  }

  private tone( freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slide = 0, bus?: GainNode ): void
  {
    if ( !this.ctx )
    {
      return;
    }
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime( freq, t0 );
    if ( slide )
    {
      o.frequency.exponentialRampToValueAtTime( Math.max( 30, freq * slide ), t0 + dur );
    }
    g.gain.setValueAtTime( 0.0001, t0 );
    g.gain.exponentialRampToValueAtTime( vol, t0 + 0.012 );
    g.gain.exponentialRampToValueAtTime( 0.0001, t0 + dur );
    o.connect( g ).connect( bus ?? this.sfx! );
    o.start( t0 );
    o.stop( t0 + dur + 0.05 );
  }

  private hiss( dur: number, freq: number, vol: number, when = 0 ): void
  {
    if ( !this.ctx )
    {
      return;
    }
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime( freq, t0 );
    f.frequency.exponentialRampToValueAtTime( 80, t0 + dur );
    const g = this.ctx.createGain();
    g.gain.setValueAtTime( vol, t0 );
    g.gain.exponentialRampToValueAtTime( 0.0001, t0 + dur );
    src.connect( f ).connect( g ).connect( this.sfx! );
    src.start( t0 );
    src.stop( t0 + dur + 0.05 );
  }

  private async loadSamples(): Promise<void>
  {
    await Promise.all( Object.keys( SFX_FILES ).map( async name =>
    {
      try
      {
        const res = await fetch( `assets/audio/sfx/${ SFX_FILES[ name ][ 0 ] }` );
        if ( res.ok && this.ctx )
        {
          this.samples[ name ] = await this.ctx.decodeAudioData( await res.arrayBuffer() );
          if ( name === 'burner_loop' )
          {
            this.useBurnerSample( this.samples[ name ] );
          }
        }
      }
      catch
      {
        // Файл не завантажився — для цього звуку лишається синтез
      }
    } ) );
  }

  // Грає записаний ефект; rate > 1 — вище й коротше. false — файлу ще немає, і викликач синтезує звук сам
  private sample( name: string, rate = 1 ): boolean
  {
    const buf = this.samples[ name ];
    if ( !this.ctx || !buf )
    {
      return false;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = SFX_FILES[ name ][ 1 ];
    src.connect( g ).connect( this.sfx! );
    src.start();
    return true;
  }

  click(): void
  {
    if ( !this.sample( 'click' ) )
    {
      this.tone( 880, 0.06, 'triangle', 0.15 );
    }
  }

  land( hard: boolean ): void
  {
    if ( this.sample( hard ? 'land_hard' : 'land_soft' ) )
    {
      return;
    }
    this.tone( hard ? 110 : 150, 0.18, 'sine', hard ? 0.5 : 0.3, 0, 0.5 );
    this.hiss( 0.15, 900, hard ? 0.25 : 0.12 );
  }

  bump(): void
  {
    if ( !this.sample( 'bump' ) )
    {
      this.tone( 200, 0.12, 'square', 0.08, 0, 0.6 );
    }
  }

  stamp(): void
  {
    if ( !this.sample( 'stamp' ) )
    {
      [ 1318, 1760, 2093 ].forEach( ( f, i ) => this.tone( f, 0.25, 'triangle', 0.18, i * 0.07 ) );
    }
  }

  deliver(): void
  {
    if ( !this.sample( 'deliver' ) )
    {
      [ 523, 659, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.3, 'triangle', 0.2, i * 0.09 ) );
    }
  }

  pop(): void
  {
    if ( this.sample( 'pop' ) )
    {
      return;
    }
    this.hiss( 0.35, 4000, 0.6 );
    this.tone( 300, 0.3, 'sawtooth', 0.15, 0, 0.2 );
  }

  splash(): void
  {
    if ( this.sample( 'splash' ) )
    {
      return;
    }
    this.hiss( 0.7, 2500, 0.5 );
    this.tone( 400, 0.4, 'sine', 0.2, 0.05, 0.3 );
  }

  // Кожна наступна зірка на велику терцію вища
  star( i: number ): void
  {
    if ( this.sample( 'star', Math.pow( 1.26, i ) ) )
    {
      return;
    }
    this.tone( 880 * Math.pow( 1.26, i ), 0.35, 'triangle', 0.22 );
    this.tone( 1760 * Math.pow( 1.26, i ), 0.25, 'sine', 0.08, 0.03 );
  }

  win(): void
  {
    if ( !this.sample( 'win' ) )
    {
      [ 523, 659, 784, 659, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.35, 'triangle', 0.18, i * 0.11 ) );
    }
  }

  // Монета долетіла в гаманець: тихий короткий дзвін, кожна наступна трохи вища (не вище за +60%)
  coin( i: number ): void
  {
    if ( !this.sample( 'coin', Math.min( 1.6, 1 + i * 0.045 ) ) )
    {
      this.tone( 1320 + i * 60, 0.09, 'triangle', 0.07 );
    }
  }

  buy(): void
  {
    if ( !this.sample( 'buy' ) )
    {
      [ 784, 1046, 1318 ].forEach( ( f, i ) => this.tone( f, 0.2, 'square', 0.07, i * 0.06 ) );
    }
  }

  // Спокійна пентатонна мелодія-скринька, генерується нескінченно без повторів у файлі
  private scheduleMusic(): void
  {
    if ( !this.ctx || this.ctx.state !== 'running' )
    {
      return;
    }
    const scale = [ 392, 440, 523, 587, 659, 784, 880 ];
    const bass = [ 131, 98, 110, 87 ];
    const beat = 0.42;
    if ( this.nextNote < this.ctx.currentTime )
    {
      this.nextNote = this.ctx.currentTime + 0.1;
    }
    while ( this.nextNote < this.ctx.currentTime + 0.5 )
    {
      const when = this.nextNote - this.ctx.currentTime;
      const i = this.noteIdx;
      if ( i % 8 === 0 )
      {
        this.tone( bass[ ( i / 8 ) % 4 ], beat * 7, 'sine', 0.18, when, 0, this.musicBus );
      }
      const pick = ( i * 7 + ( ( i / 8 ) | 0 ) * 3 ) % 11;
      if ( pick < 7 && i % 2 === 0 || pick < 3 )
      {
        this.tone( scale[ pick % scale.length ], beat * 1.8, 'triangle', 0.07, when, 0, this.musicBus );
      }
      this.noteIdx++;
      this.nextNote += beat;
    }
  }

  // Сцена каже, який трек потрібен; якщо інший уже грає — плавно перетікає в новий
  music( mode: MusicMode ): void
  {
    if ( mode === this.mode )
    {
      return;
    }
    this.mode = mode;
    if ( this.tracks[ mode ] )
    {
      this.playTrack( SWITCH_FADE );
    }
  }

  // Треки вантажаться після першого жесту, щоб не затримувати старт гри.
  // Поки потрібного немає або він не завантажився, грає синтезована петля
  private async loadTrack(): Promise<void>
  {
    // Спершу той, що потрібен зараз, — щоб музика почалась якомога раніше
    const order: MusicMode[] = this.mode === 'map' ? [ 'map', 'level' ] : [ 'level', 'map' ];
    for ( const mode of order )
    {
      try
      {
        const res = await fetch( TRACKS[ mode ].url );
        if ( !res.ok || !this.ctx )
        {
          continue;
        }
        const buf = await this.ctx.decodeAudioData( await res.arrayBuffer() );
        this.tracks[ mode ] = { buf, len: Math.min( audibleLength( buf ), TRACKS[ mode ].end ?? Infinity ) };
        if ( mode === this.mode && !this.voice )
        {
          clearInterval( this.musicTimer );
          this.playTrack( 2 );
        }
      }
      catch
      {
        // Немає файлу чи браузер не декодує MP3 — лишається синтез або інший трек
      }
    }
  }

  // Трек згенерований, а не написаний під безшовну петлю: кожне коло плавно перетікає в наступне.
  // Попереднє коло (або трек іншої сцени) затухає за той самий час, за який наростає нове
  private playTrack( fadeIn: number ): void
  {
    const ctx = this.ctx;
    const track = this.tracks[ this.mode ];
    if ( !ctx || !track || !this.musicBus )
    {
      return;
    }
    clearTimeout( this.trackTimer );
    const t0 = ctx.currentTime;
    if ( this.voice )
    {
      const old = this.voice.gain;
      old.cancelScheduledValues( t0 );
      old.setValueAtTime( old.value, t0 );
      old.linearRampToValueAtTime( 0, t0 + fadeIn );
      this.voiceSrc?.stop( t0 + fadeIn + 0.05 );
    }
    const src = ctx.createBufferSource();
    src.buffer = track.buf;
    const g = ctx.createGain();
    const len = track.len;
    g.gain.setValueAtTime( 0, t0 );
    g.gain.linearRampToValueAtTime( TRACK_GAIN, t0 + fadeIn );
    g.gain.setValueAtTime( TRACK_GAIN, t0 + len - CROSSFADE );
    g.gain.linearRampToValueAtTime( 0, t0 + len );
    src.connect( g ).connect( this.musicBus );
    src.start( t0 );
    this.voice = g;
    this.voiceSrc = src;
    this.trackTimer = window.setTimeout( () => this.playTrack( CROSSFADE ), ( len - CROSSFADE ) * 1000 );
  }

  dispose(): void
  {
    clearInterval( this.musicTimer );
    clearTimeout( this.trackTimer );
  }
}

export const audio = new Synth();
