// Єдина точка доступу до платформи: реклама, події гри, сховище, mute від порталу.
// Під APK через Capacitor достатньо додати ще одну реалізацію Ads (AdMob).

import { initAnalytics, track } from './analytics.ts';

export type AdKind = 'midgame' | 'rewarded';

export interface KeyValueStorage
{
  getItem( key: string ): string | null;
  setItem( key: string, value: string ): void;
}

export interface Ads
{
  readonly name: string;
  init(): Promise<void>;
  // true, коли рекламу з винагородою справді можна показати; інакше гра дає безрекламну альтернативу
  rewardedAvailable(): boolean;
  // true, якщо реклама справді показалась
  midgame(): Promise<boolean>;
  rewarded(): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingStart(): void;
  loadingStop(): void;
  happytime(): void;
  progress( percent: number ): void;
  platformMuted(): boolean;
  onPlatformMute( cb: ( muted: boolean ) => void ): void;
  // Мова гравця за даними порталу (наприклад, 'uk-UA'); null — портал не знає
  locale(): string | null;
  storage: KeyValueStorage;
}

export interface AdHooks
{
  // Під час реклами гра стає на паузу й замовкає
  onAdStart(): void;
  onAdEnd(): void;
}

export const adHooks: AdHooks = { onAdStart: () => {}, onAdEnd: () => {} };

function safeLocalStorage(): KeyValueStorage
{
  const mem = new Map<string, string>();
  return {
    getItem( key )
    {
      try
      {
        return window.localStorage.getItem( key );
      }
      catch
      {
        return mem.get( key ) ?? null;
      }
    },
    setItem( key, value )
    {
      try
      {
        window.localStorage.setItem( key, value );
      }
      catch
      {
        mem.set( key, value );
      }
    }
  };
}

// Заглушка для розробки й інших порталів: реклама «показується» оверлеєм на секунду
class StubAds implements Ads
{
  readonly name: string = 'stub';
  storage: KeyValueStorage = safeLocalStorage();

  async init(): Promise<void> {}

  rewardedAvailable(): boolean
  {
    return true;
  }

  midgame(): Promise<boolean>
  {
    // Поза dev-збіркою заглушка нічого не показує
    return import.meta.env.DEV ? this.fake( 'Midgame ad (stub)' ) : Promise.resolve( false );
  }

  rewarded(): Promise<boolean>
  {
    return this.fake( 'Rewarded ad (stub)' );
  }

  gameplayStart(): void {}
  gameplayStop(): void {}
  loadingStart(): void {}
  loadingStop(): void {}
  happytime(): void {}
  progress(): void {}

  platformMuted(): boolean
  {
    return false;
  }

  onPlatformMute(): void {}

  locale(): string | null
  {
    return null;
  }

  private fake( label: string ): Promise<boolean>
  {
    if ( !import.meta.env.DEV )
    {
      return Promise.resolve( true );
    }
    adHooks.onAdStart();
    const el = document.createElement( 'div' );
    el.textContent = label;
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.85);color:#fff;font:24px sans-serif;z-index:99';
    document.body.appendChild( el );
    return new Promise( ( res ) => setTimeout( () =>
    {
      el.remove();
      adHooks.onAdEnd();
      res( true );
    }, 900 ) );
  }
}

interface CgSdk
{
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd( kind: AdKind, cb: { adStarted?(): void; adFinished?(): void; adError?( e: { code: string; message: string } ): void } ): void;
    hasAdblock(): Promise<boolean>;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    reportGameCompletedPercentage?( n: number ): void;
    settings: { muteAudio: boolean };
    addSettingsChangeListener( fn: ( s: { muteAudio: boolean } ) => void ): void;
  };
  data: KeyValueStorage;
  user?: { systemInfo?: { locale?: string } };
}

class CrazyGamesAds implements Ads
{
  readonly name: string = 'crazygames';
  storage: KeyValueStorage;
  private adblock = false;
  // На Basic Launch реклама вимкнена (adsDisabled): тоді кнопки винагороди переходять на безрекламну альтернативу
  private noAds = false;
  private playing = false;
  private busy = false;

  private sdk: CgSdk;

  constructor( sdk: CgSdk )
  {
    this.sdk = sdk;
    this.storage = sdk.data;
  }

  async init(): Promise<void>
  {
    try
    {
      this.adblock = await this.sdk.ad.hasAdblock();
    }
    catch
    {
      this.adblock = false;
    }
  }

  rewardedAvailable(): boolean
  {
    return !this.adblock && !this.noAds;
  }

  midgame(): Promise<boolean>
  {
    return this.request( 'midgame' );
  }

  rewarded(): Promise<boolean>
  {
    return this.request( 'rewarded' );
  }

  private request( kind: AdKind ): Promise<boolean>
  {
    if ( this.busy )
    {
      return Promise.resolve( false );
    }
    this.busy = true;
    return new Promise( ( res ) =>
    {
      let started = false;
      const done = ( ok: boolean, error = '' ) =>
      {
        this.busy = false;
        track( 'ad', { kind, result: ok ? 'shown' : error || 'failed' } );
        if ( started )
        {
          adHooks.onAdEnd();
        }
        res( ok );
      };
      this.sdk.ad.requestAd( kind, {
        adStarted: () =>
        {
          started = true;
          adHooks.onAdStart();
        },
        adFinished: () => done( true ),
        adError: ( e ) =>
        {
          if ( e?.code === 'adsDisabled' || e?.code === 'adblock' )
          {
            this.noAds = true;
          }
          done( false, e?.code );
        }
      } );
    } );
  }

  gameplayStart(): void
  {
    if ( !this.playing )
    {
      this.playing = true;
      this.sdk.game.gameplayStart();
    }
  }

  gameplayStop(): void
  {
    if ( this.playing )
    {
      this.playing = false;
      this.sdk.game.gameplayStop();
    }
  }

  loadingStart(): void
  {
    this.sdk.game.loadingStart();
  }

  loadingStop(): void
  {
    this.sdk.game.loadingStop();
  }

  happytime(): void
  {
    this.sdk.game.happytime();
  }

  progress( percent: number ): void
  {
    this.sdk.game.reportGameCompletedPercentage?.( Math.round( percent ) );
  }

  platformMuted(): boolean
  {
    return !!this.sdk.game.settings?.muteAudio;
  }

  onPlatformMute( cb: ( muted: boolean ) => void ): void
  {
    this.sdk.game.addSettingsChangeListener( ( s ) => cb( !!s.muteAudio ) );
  }

  locale(): string | null
  {
    try
    {
      return this.sdk.user?.systemInfo?.locale ?? null;
    }
    catch
    {
      return null;
    }
  }
}

function loadScript( src: string, timeoutMs: number ): Promise<void>
{
  return new Promise( ( res, rej ) =>
  {
    const s = document.createElement( 'script' );
    s.src = src;
    s.async = true;
    const timer = setTimeout( () => rej( new Error( 'timeout' ) ), timeoutMs );
    s.onload = () =>
    {
      clearTimeout( timer );
      res();
    };
    s.onerror = () =>
    {
      clearTimeout( timer );
      rej( new Error( 'load' ) );
    };
    document.head.appendChild( s );
  } );
}

export let platform: Ads = new StubAds();

export async function initPlatform(): Promise<void>
{
  const params = new URLSearchParams( location.search );
  const wantCg = !import.meta.env.DEV || params.has( 'cg' ) || params.has( 'useLocalSdk' );
  if ( wantCg )
  {
    try
    {
      await loadScript( 'https://sdk.crazygames.com/crazygames-sdk-v3.js', 6000 );
      const sdk = ( window as unknown as { CrazyGames?: { SDK: CgSdk } } ).CrazyGames?.SDK;
      if ( sdk )
      {
        await sdk.init();
        if ( sdk.environment !== 'disabled' )
        {
          platform = new CrazyGamesAds( sdk );
        }
      }
    }
    catch
    {
      // Без SDK (інший портал, офлайн, блокувальник) гра працює на заглушці
    }
  }
  await platform.init();
  initAnalytics();
  track( 'game_start', { platform: platform.name, locale: platform.locale() ?? navigator.language } );
  // Завантаження вже йде (екран завантаження показаний раніше за SDK), тож повідомляємо одразу
  platform.loadingStart();
}
