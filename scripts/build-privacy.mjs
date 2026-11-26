// Збирає сторінку політики конфіденційності з HTML-експорту Termly (безкоштовний план дає лише HTML).
// Після нового експорту: зберегти його в legal/termly-export.html, зібрати й викласти на Cloudflare Pages:
//   node scripts/build-privacy.mjs
//   npx wrangler pages deploy <абсолютний шлях до legal/site> --project-name kosmogames --branch main
// Деплоїти з порожньої теки: у корені проєкту wrangler 4.16x сам переналаштовує його під Workers і викладає всю гру
// Правки нижче прибирають шаблонні фрази Termly, які не відповідають грі.
// Якщо Termly змінить текст, скрипт упаде й назве фразу, яку не знайшов.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve( import.meta.dirname, '..' );
const src = path.join( root, 'legal', 'termly-export.html' );
// Тека legal/site — це весь сайт на Pages: сторінка буде за адресою /sky-post/privacy
const out = path.join( root, 'legal', 'site', 'sky-post', 'privacy.html' );

const MAIL = 'kosmogames.privacy@gmail.com';
const MAIL_LINK = `<a target="_blank" data-custom-class="link" href="mailto:${ MAIL }">${ MAIL }</a>`;
const BLUE = '<span style="color: rgb(0, 58, 250);"><bdt class="question noTranslate">';

let html = fs.readFileSync( src, 'utf8' );

function fix( from, to, count = 1 )
{
  const n = html.split( from ).length - 1;
  if ( n !== count )
  {
    throw new Error( `Очікував ${ count }×, знайшов ${ n }×: ${ from.slice( 0, 90 ) }` );
  }
  html = html.split( from ).join( to );
}

// Окремої Cookie Notice немає: рекламою й cookies на порталі керує CrazyGames
fix(
  'Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice',
  'The game itself does not set cookies. Advertising on CrazyGames, the related cookies and your choices about them are managed by CrazyGames as described in its <a target="_blank" data-custom-class="link" href="https://www.crazygames.com/privacy-policy">privacy policy</a>'
);

// Групи компаній немає
fix( 'between our group companies and between us', 'between us' );

// Акаунтів у грі немає
fix( 'You may review, change, or terminate your account at any time, depending on your country, province, or state of residence.', '' );

// Вулиці в адресі немає, тож поштою не пишемо — лише email і хто відповідає за дані
fix( `${ MAIL_LINK } or&nbsp;`, `${ MAIL_LINK }.&nbsp;` );
fix( 'contact us by post at:', 'The controller responsible for your personal information is:' );

// «visiting mailto:…» → «emailing …»; у розділі США email і так названо одразу далі
fix( `you can contact us <bdt class="block-component"></bdt>by visiting ${ BLUE }mailto:${ MAIL_LINK }</bdt></span>, `, 'you can contact us <bdt class="block-component"></bdt>' );
fix( `visiting ${ BLUE }mailto:`, `emailing ${ BLUE }` );
fix( `visit: ${ BLUE }mailto:`, `email: ${ BLUE }` );

// Власний розділ 14: Termly не перетворює порожні рядки на абзаци
const a = html.indexOf( '<div id="clausea"' );
const b = html.indexOf( '<div id="policyupdates"' );
if ( a < 0 || b < a )
{
  throw new Error( 'Не знайшов розділ 14 (clausea)' );
}
html = html.slice( 0, a ) + html.slice( a, b ).replace( /\r?\n\r?\n/g, '<br><br>' ) + html.slice( b );

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sky Post Privacy Policy</title>
<style>
  body { margin: 0; background: #fff; }
  main { max-width: 820px; margin: 0 auto; padding: 32px 20px 48px; }
  table { border-collapse: collapse; }
  td, th { padding: 4px 8px; vertical-align: top; }
</style>
</head>
<body>
<main>
${ html }
</main>
</body>
</html>
`;

fs.mkdirSync( path.dirname( out ), { recursive: true } );
fs.writeFileSync( out, page );
console.log( `OK → ${ path.relative( root, out ) } (${ page.length } bytes)` );
