import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { LoadScene } from './scenes/LoadScene.ts';
import { BgScene } from './scenes/BgScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { UIScene } from './scenes/UIScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { FgScene } from './scenes/FgScene.ts';
import { choosePack } from './ui/pack.ts';
import { adHooks, platform } from './platform/platform.ts';
import { gameDataReady } from './core/startup.ts';
import { LangScene } from './scenes/LangScene.ts';
import { audio } from './core/audio.ts';
import { fullscreenOnFirstTap } from './platform/fullscreen.ts';
import { loadGameFont } from './ui/font.ts';

async function start(): Promise<void>
{
  // SDK порталу не тримає екран завантаження: він вантажиться паралельно, а LoadScene дочекається його перед файлами гри
  const data = gameDataReady();
  await loadGameFont();
  if ( import.meta.env.DEV )
  {
    await ( await import( './ui/fontPreview.ts' ) ).previewFont();
  }
  choosePack();

  const game = new Phaser.Game( {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#5cb8f8',
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1920,
      height: 1080
    },
    input: { activePointers: 3 },
    // Картинки через <img>, а не XHR-blob: тоді браузер віддає їх із <link rel="preload" as="image"> в index.html,
    // а не качає вдруге. crossOrigin явно, щоб режим запиту збігався з crossorigin у preload
    loader: { imageLoadType: 'HTMLImageElement', crossOrigin: 'anonymous' },
    render: { antialias: true },
    scene: [ LoadScene, BootScene, BgScene, GameScene, FgScene, UIScene, MapScene, ShopScene, LangScene ]
  } );

  adHooks.onAdStart = () =>
  {
    audio.setAdMuted( true );
    game.pause();
  };
  adHooks.onAdEnd = () =>
  {
    audio.setAdMuted( false );
    game.resume();
  };
  void data.then( () =>
  {
    platform.onPlatformMute( () => audio.applyVolume() );
    audio.applyVolume();
  } );

  const unlock = () => audio.unlock();
  window.addEventListener( 'pointerdown', unlock );
  window.addEventListener( 'touchend', unlock );
  window.addEventListener( 'keydown', unlock );
  fullscreenOnFirstTap();

  if ( import.meta.env.DEV )
  {
    ( window as unknown as { game: Phaser.Game } ).game = game;
    import( './editor/editor.ts' ).then( ( m ) => m.installEditor( game ) );
  }
}

void start();
