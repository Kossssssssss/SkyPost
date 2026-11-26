import { initPlatform, platform } from '../platform/platform.ts';
import { early, track } from '../platform/analytics.ts';
import { hadSave, loadSave } from './save.ts';
import { loadLang } from './i18n.ts';

let ready: Promise<void> | null = null;

// SDK порталу вантажиться паралельно з екраном завантаження. Сейв і мова лежать у його сховищі,
// тож їх читаємо одразу після нього; гра чекає на це лише перед тим, як ставити в чергу свої файли
export function gameDataReady(): Promise<void>
{
  ready ??= initPlatform().then( () =>
  {
    loadSave();
    loadLang();
    // Після сейву: з нього видно, новий гравець чи той, що повертається
    track( 'game_start', { platform: platform.name, locale: platform.locale() ?? navigator.language, returning: hadSave() } );
    early( 'f01_open', { platform: platform.name } );
  } );
  return ready;
}
