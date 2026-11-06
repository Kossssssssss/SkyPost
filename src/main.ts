import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { BgScene } from './scenes/BgScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { UIScene } from './scenes/UIScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { FgScene } from './scenes/FgScene.ts';
import { choosePack } from './ui/pack.ts';
import { initPlatform, adHooks, platform } from './platform/platform.ts';
import { loadLang } from './core/i18n.ts';
import { LangScene } from './scenes/LangScene.ts';
import { loadSave } from './core/save.ts';
import { audio } from './core/audio.ts';
import { fullscreenOnFirstTap } from './platform/fullscreen.ts';
import { loadGameFont } from './ui/font.ts';

async function start(): Promise<void>
{
  await Promise.all( [ initPlatform(), loadGameFont() ] );
  if ( import.meta.env.DEV )
  {
    await ( await import( './ui/fontPreview.ts' ) ).previewFont();
  }
  loadSave();
  loadLang();
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
    render: { antialias: true },
    scene: [ BootScene, BgScene, GameScene, FgScene, UIScene, MapScene, ShopScene, LangScene ]
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
  platform.onPlatformMute( () => audio.applyVolume() );

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
