import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { BgScene } from './scenes/BgScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { UIScene } from './scenes/UIScene.ts';
import { MapScene } from './scenes/MapScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';
import { FgScene } from './scenes/FgScene.ts';
import { choosePack } from './ui/pack.ts';
import { setupOrientation } from './platform/orientation.ts';
import { initPlatform, adHooks, platform } from './platform/platform.ts';
import { loadSave } from './core/save.ts';
import { audio } from './core/audio.ts';

async function start(): Promise<void>
{
  await initPlatform();
  loadSave();
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
    scene: [ BootScene, BgScene, GameScene, FgScene, UIScene, MapScene, ShopScene ]
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
  setupOrientation( game );

  const unlock = () => audio.unlock();
  window.addEventListener( 'pointerdown', unlock );
  window.addEventListener( 'touchend', unlock );
  window.addEventListener( 'keydown', unlock );

  if ( import.meta.env.DEV )
  {
    ( window as unknown as { game: Phaser.Game } ).game = game;
    import( './editor/editor.ts' ).then( ( m ) => m.installEditor( game ) );
  }
}

void start();
