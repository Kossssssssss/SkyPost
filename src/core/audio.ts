import { platform } from '../platform/platform.ts';
import { save, persist } from './save.ts';

// Увесь звук синтезується на льоту: нуль файлів, мінімальний стартовий розмір збірки
class Synth
{
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private musicBus?: GainNode;
  private burnGain?: GainNode;
  private noise?: AudioBuffer;
  private adMuted = false;
  private musicTimer = 0;
  private nextNote = 0;
  private noteIdx = 0;

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
  }

  burner( on: boolean ): void
  {
    if ( this.ctx && this.burnGain )
    {
      this.burnGain.gain.setTargetAtTime( on ? 0.22 : 0, this.ctx.currentTime, on ? 0.04 : 0.12 );
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

  click(): void
  {
    this.tone( 880, 0.06, 'triangle', 0.15 );
  }

  land( hard: boolean ): void
  {
    this.tone( hard ? 110 : 150, 0.18, 'sine', hard ? 0.5 : 0.3, 0, 0.5 );
    this.hiss( 0.15, 900, hard ? 0.25 : 0.12 );
  }

  bump(): void
  {
    this.tone( 200, 0.12, 'square', 0.08, 0, 0.6 );
  }

  stamp(): void
  {
    [ 1318, 1760, 2093 ].forEach( ( f, i ) => this.tone( f, 0.25, 'triangle', 0.18, i * 0.07 ) );
  }

  deliver(): void
  {
    [ 523, 659, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.3, 'triangle', 0.2, i * 0.09 ) );
  }

  pop(): void
  {
    this.hiss( 0.35, 4000, 0.6 );
    this.tone( 300, 0.3, 'sawtooth', 0.15, 0, 0.2 );
  }

  splash(): void
  {
    this.hiss( 0.7, 2500, 0.5 );
    this.tone( 400, 0.4, 'sine', 0.2, 0.05, 0.3 );
  }

  star( i: number ): void
  {
    this.tone( 880 * Math.pow( 1.26, i ), 0.35, 'triangle', 0.22 );
    this.tone( 1760 * Math.pow( 1.26, i ), 0.25, 'sine', 0.08, 0.03 );
  }

  win(): void
  {
    [ 523, 659, 784, 659, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.35, 'triangle', 0.18, i * 0.11 ) );
  }

  buy(): void
  {
    [ 784, 1046, 1318 ].forEach( ( f, i ) => this.tone( f, 0.2, 'square', 0.07, i * 0.06 ) );
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

  dispose(): void
  {
    clearInterval( this.musicTimer );
  }
}

export const audio = new Synth();
