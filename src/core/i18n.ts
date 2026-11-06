import { platform } from '../platform/platform.ts';

const en = {
  title: 'Sky Post',
  hold: 'Hold to heat',
  holdHint: 'Hold mouse, finger or SPACE to heat the balloon.\nRelease to cool down and descend.',
  tip_hold: 'Hold to heat and rise. Release to cool and sink.\nThe wind carries you — land on the mailbox!',
  tip_layers: 'Each height has its own wind.\nCheck the wind panel on the left!',
  tip_calm: 'The air near the ground is calm —\nperfect for a soft landing.',
  tip_stars: 'Save gas for ★★ and grab the stamp for ★★★',
  tip_birds: 'Watch out for birds!',
  tip_order: 'Two letters! Deliver them in order.',
  tip_islands: 'Land only on islands — water ruins the mail!',
  tip_gusts: 'Gusts! The wind here keeps changing strength.',
  tip_fuel: 'Limited gas tank — plan your route!',
  tip_updraft: 'Warm updrafts lift you up for free.',
  tip_pass: 'Narrow passes ahead. Easy on the burner!',
  tut_hold: 'Press and hold — the burner heats the balloon and it lifts off',
  tut_release: 'Now let go — the air cools down and the balloon sinks',
  tut_stamp: 'Fly through the stamp — that is the third star ★',
  tut_land: 'Ease down onto the mailbox to deliver the mail',
  condDeliver: 'Deliver the mail',
  condDeliverN: 'Deliver {0} letters in order',
  condGas: 'Use at most {0} gas',
  condStamp: 'Grab the stamp',
  tank: 'Gas tank: {0}',
  showRoute: 'Show route',
  plusGas: '+50% gas',
  freeAfter: 'Free after {0} tries',
  free: 'Free',
  routeOn: 'Route shown',
  delivered: 'Delivered!',
  popped: 'Popped!',
  splash: 'Splash!',
  outOfGas: 'Out of gas!',
  retry: 'Retry',
  next: 'Next',
  map: 'Map',
  shop: 'Shop',
  back: 'Back',
  paused: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  world: 'World {0}',
  needStars: 'Collect {0} ★ to unlock',
  soon: 'Coming soon',
  gas: 'Gas',
  owned: 'Owned',
  equip: 'Equip',
  equipped: 'Equipped',
  special: '★★★ all levels of world {0}',
  newStars: '+{0} ★',
  envelope: 'Balloons',
  basket: 'Baskets',
  trail: 'Trails',
  pilot: 'Pilots',
  wallet: 'Stars to spend',
  allDone: 'All worlds complete! More coming soon.',
  noAds: 'Ads unavailable',
  editorHelp: 'EDITOR: 1 block 2 target 3 stamp 4 start 5 bird 6 updraft 7 layer  Del remove  Wheel wind  S save  P play  [ ] level'
};

type Dict = typeof en;

const uk: Dict = {
  title: 'Повітряна пошта',
  hold: 'Утримуй, щоб гріти',
  holdHint: 'Утримуй мишку, палець або ПРОБІЛ — куля гріється.\nВідпусти — охолоне й опуститься.',
  tip_hold: 'Утримуй — куля гріється й злітає. Відпусти — опускається.\nНесе вітер, тож сідай на поштову скриньку!',
  tip_layers: 'На кожній висоті свій вітер.\nДивись на панель вітру ліворуч!',
  tip_calm: 'Біля землі штиль —\nідеально для м\'якої посадки.',
  tip_stars: 'Ощадь газ для ★★ і хапай марку для ★★★',
  tip_birds: 'Стережись птахів!',
  tip_order: 'Два листи! Доставляй по черзі.',
  tip_islands: 'Сідай лише на острови — вода зіпсує пошту!',
  tip_gusts: 'Пориви! Сила вітру тут весь час змінюється.',
  tip_fuel: 'Бак обмежений — продумай маршрут!',
  tip_updraft: 'Теплі висхідні потоки піднімають безкоштовно.',
  tip_pass: 'Попереду вузькі перевали. Обережно з пальником!',
  tut_hold: 'Затисни й тримай — пальник нагріє кулю, і вона злетить',
  tut_release: 'Тепер відпусти — повітря охолоне, і куля почне знижуватись',
  tut_stamp: 'Пролети крізь марку — це третя зірка ★',
  tut_land: 'Плавно сідай на поштову скриньку, щоб доставити пошту',
  condDeliver: 'Доставити пошту',
  condDeliverN: 'Доставити {0} листи по черзі',
  condGas: 'Витратити не більше {0} газу',
  condStamp: 'Зібрати марку',
  tank: 'Бак: {0}',
  showRoute: 'Маршрут',
  plusGas: '+50% газу',
  freeAfter: 'Безкоштовно після {0} спроб',
  free: 'Безкоштовно',
  routeOn: 'Маршрут показано',
  delivered: 'Доставлено!',
  popped: 'Лопнула!',
  splash: 'Бульк!',
  outOfGas: 'Скінчився газ!',
  retry: 'Ще раз',
  next: 'Далі',
  map: 'Карта',
  shop: 'Магазин',
  back: 'Назад',
  paused: 'Пауза',
  resume: 'Продовжити',
  restart: 'Заново',
  world: 'Світ {0}',
  needStars: 'Збери {0} ★, щоб відкрити',
  soon: 'Скоро',
  gas: 'Газ',
  owned: 'Є',
  equip: 'Вдягти',
  equipped: 'Вдягнено',
  special: '★★★ на всіх рівнях світу {0}',
  newStars: '+{0} ★',
  envelope: 'Кулі',
  basket: 'Кошики',
  trail: 'Шлейфи',
  pilot: 'Пілоти',
  wallet: 'Зірки на витрати',
  allDone: 'Усі світи пройдено! Скоро буде більше.',
  noAds: 'Реклама недоступна',
  editorHelp: 'РЕДАКТОР: 1 блок 2 ціль 3 марка 4 старт 5 птах 6 потік 7 шар  Del видалити  Колесо вітер  S зберегти  P грати  [ ] рівень'
};

const ru: Dict = {
  title: 'Воздушная почта',
  hold: 'Удерживай, чтобы греть',
  holdHint: 'Удерживай мышь, палец или ПРОБЕЛ — шар греется.\nОтпусти — остынет и опустится.',
  tip_hold: 'Удерживай — шар греется и взлетает. Отпусти — опускается.\nНесёт ветер, так что садись на почтовый ящик!',
  tip_layers: 'На каждой высоте свой ветер.\nСмотри на панель ветра слева!',
  tip_calm: 'У земли штиль —\nидеально для мягкой посадки.',
  tip_stars: 'Экономь газ для ★★ и хватай марку для ★★★',
  tip_birds: 'Берегись птиц!',
  tip_order: 'Два письма! Доставляй по очереди.',
  tip_islands: 'Садись только на острова — вода испортит почту!',
  tip_gusts: 'Порывы! Сила ветра здесь всё время меняется.',
  tip_fuel: 'Бак ограничен — продумай маршрут!',
  tip_updraft: 'Тёплые восходящие потоки поднимают бесплатно.',
  tip_pass: 'Впереди узкие перевалы. Осторожно с горелкой!',
  tut_hold: 'Зажми и держи — горелка нагреет шар, и он взлетит',
  tut_release: 'Теперь отпусти — воздух остынет, и шар начнёт снижаться',
  tut_stamp: 'Пролети сквозь марку — это третья звезда ★',
  tut_land: 'Плавно садись на почтовый ящик, чтобы доставить почту',
  condDeliver: 'Доставить почту',
  condDeliverN: 'Доставить {0} письма по очереди',
  condGas: 'Потратить не больше {0} газа',
  condStamp: 'Собрать марку',
  tank: 'Бак: {0}',
  showRoute: 'Маршрут',
  plusGas: '+50% газа',
  freeAfter: 'Бесплатно после {0} попыток',
  free: 'Бесплатно',
  routeOn: 'Маршрут показан',
  delivered: 'Доставлено!',
  popped: 'Лопнул!',
  splash: 'Бульк!',
  outOfGas: 'Кончился газ!',
  retry: 'Ещё раз',
  next: 'Дальше',
  map: 'Карта',
  shop: 'Магазин',
  back: 'Назад',
  paused: 'Пауза',
  resume: 'Продолжить',
  restart: 'Заново',
  world: 'Мир {0}',
  needStars: 'Собери {0} ★, чтобы открыть',
  soon: 'Скоро',
  gas: 'Газ',
  owned: 'Есть',
  equip: 'Надеть',
  equipped: 'Надето',
  special: '★★★ на всех уровнях мира {0}',
  newStars: '+{0} ★',
  envelope: 'Шары',
  basket: 'Корзины',
  trail: 'Шлейфы',
  pilot: 'Пилоты',
  wallet: 'Звёзды на траты',
  allDone: 'Все миры пройдены! Скоро будет больше.',
  noAds: 'Реклама недоступна',
  editorHelp: 'РЕДАКТОР: 1 блок 2 цель 3 марка 4 старт 5 птица 6 поток 7 слой  Del удалить  Колесо ветер  S сохранить  P играть  [ ] уровень'
};

// Назви рівнів, світів і скінів лежать у даних англійською; перекладаємо їх за самою назвою,
// щоб не дублювати ключі в JSON рівнів. Невідома назва лишається як є
const NAMES: Record<string, [ string, string ]> = {
  'Meadows': [ 'Луки', 'Луга' ],
  'Sea & Lighthouses': [ 'Море й маяки', 'Море и маяки' ],
  'Mountains': [ 'Гори', 'Горы' ],
  'Thunder Peaks': [ 'Грозові вершини', 'Грозовые вершины' ],
  'Night City': [ 'Нічне місто', 'Ночной город' ],
  'First Flight': [ 'Перший політ', 'Первый полёт' ],
  'Two Winds': [ 'Два вітри', 'Два ветра' ],
  'Way Back': [ 'Шлях назад', 'Путь назад' ],
  'The Hill': [ 'Пагорб', 'Холм' ],
  'Hilltop Post': [ 'Пошта на пагорбі', 'Почта на холме' ],
  'Birdwatch': [ 'Пташиний край', 'Птичий край' ],
  'Two Letters': [ 'Два листи', 'Два письма' ],
  'Meadow Finale': [ 'Фінал на луках', 'Финал на лугах' ],
  'Island Hop': [ 'З острова на острів', 'С острова на остров' ],
  'Gusty Bay': [ 'Вітряна затока', 'Ветреный залив' ],
  'Back to Shore': [ 'Назад до берега', 'Назад к берегу' ],
  'Gull Patrol': [ 'Чайковий патруль', 'Патруль чаек' ],
  'The Lighthouse': [ 'Маяк', 'Маяк' ],
  'Two Parcels': [ 'Дві посилки', 'Две посылки' ],
  'Short Tank': [ 'Малий бак', 'Малый бак' ],
  'Storm Coast': [ 'Штормове узбережжя', 'Штормовой берег' ],
  'Foothills': [ 'Передгір’я', 'Предгорья' ],
  'The Pass': [ 'Перевал', 'Перевал' ],
  'Summit Post': [ 'Пошта на вершині', 'Почта на вершине' ],
  'Overhang': [ 'Навис', 'Навес' ],
  'Updraft Canyon': [ 'Каньйон потоків', 'Каньон потоков' ],
  'Rockfall': [ 'Камінепад', 'Камнепад' ],
  'Thin Air': [ 'Розріджене повітря', 'Разреженный воздух' ],
  'Peak Express': [ 'Гірський експрес', 'Горный экспресс' ],
  'Classic': [ 'Класика', 'Классика' ],
  'Sky': [ 'Небо', 'Небо' ],
  'Sunset': [ 'Захід', 'Закат' ],
  'Polka': [ 'Горошок', 'Горошек' ],
  'Racer': [ 'Гонщик', 'Гонщик' ],
  'Patchwork': [ 'Клаптики', 'Лоскутки' ],
  'Bloom': [ 'Цвітіння', 'Цветение' ],
  'Lighthouse': [ 'Маяк', 'Маяк' ],
  'Aurora': [ 'Сяйво', 'Сияние' ],
  'Wicker': [ 'Плетений', 'Плетёная' ],
  'Painted': [ 'Фарбований', 'Крашеная' ],
  'Golden': [ 'Золотий', 'Золотая' ],
  'None': [ 'Без шлейфу', 'Без шлейфа' ],
  'Puffs': [ 'Хмарки', 'Облачка' ],
  'Sparkles': [ 'Іскри', 'Искры' ],
  'Hearts': [ 'Серця', 'Сердца' ],
  'Rainbow': [ 'Веселка', 'Радуга' ],
  'Fox': [ 'Лис', 'Лис' ],
  'Cat': [ 'Кіт', 'Кот' ],
  'Owl': [ 'Сова', 'Сова' ],
  'Frog': [ 'Жаба', 'Лягушка' ]
};

export type TextKey = keyof Dict;
export type Lang = 'uk' | 'ru' | 'en';
export const LANGS: Lang[] = [ 'uk', 'ru', 'en' ];
// Підписи кнопок вибору кожен своєю мовою: їх читають ще до того, як мову вибрано
export const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', ru: 'Русский', en: 'English' };

const DICTS: Record<Lang, Dict> = { uk, ru, en };
const LANG_KEY = 'skypost.lang';

function guessLang(): Lang
{
  const n = ( navigator.language || 'en' ).toLowerCase();
  if ( n.startsWith( 'uk' ) )
  {
    return 'uk';
  }
  return /^(ru|be|kk)/.test( n ) ? 'ru' : 'en';
}

let lang: Lang = guessLang();
let chosen = false;

// Читаємо вибір після initPlatform: на CrazyGames сховище — це їхній SDK, а не localStorage
export function loadLang(): void
{
  try
  {
    const v = platform.storage.getItem( LANG_KEY ) as Lang | null;
    if ( v && LANGS.includes( v ) )
    {
      lang = v;
      chosen = true;
    }
  }
  catch
  {
    // Без сховища просто спитаємо мову ще раз
  }
  document.documentElement.lang = lang;
}

export function langChosen(): boolean
{
  return chosen;
}

export function currentLang(): Lang
{
  return lang;
}

export function setLang( l: Lang ): void
{
  lang = l;
  chosen = true;
  document.documentElement.lang = l;
  try
  {
    platform.storage.setItem( LANG_KEY, l );
  }
  catch
  {
    // Не зберіглось — гра все одно йде вибраною мовою до перезапуску
  }
}

export function t( key: TextKey, ...args: ( string | number )[] ): string
{
  let s = DICTS[ lang ][ key ] ?? en[ key ] ?? key;
  args.forEach( ( a, i ) => { s = s.replace( '{' + i + '}', String( a ) ); } );
  return s;
}

export function tn( name: string ): string
{
  const tr = NAMES[ name ];
  if ( !tr || lang === 'en' )
  {
    return name;
  }
  return lang === 'uk' ? tr[ 0 ] : tr[ 1 ];
}

export function hasText( key: string ): key is TextKey
{
  return key in en;
}
