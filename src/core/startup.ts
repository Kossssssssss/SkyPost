import { initPlatform } from '../platform/platform.ts';
import { loadSave } from './save.ts';
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
  } );
  return ready;
}
