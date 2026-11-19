import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const html = await readFile('web/index.html', 'utf8');
const worker = await readFile('worker/index.js', 'utf8');
const assets = {};
for (const [route, file, type] of [
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/shop.js', 'shop.js', 'text/javascript; charset=utf-8'],
  ['/products/rabbit.jpg', 'rabbit.jpg', 'image/jpeg'],
  ['/products/bird.jpg', 'bird.jpg', 'image/jpeg']
]) {
  const encoding = type.startsWith('image/') ? 'base64' : 'utf8';
  assets[route] = {type, value: await readFile('web/' + file, encoding)};
}
await mkdir('dist/server', {recursive: true});
await writeFile('dist/server/index.js', 'const PAGE = ' + JSON.stringify(html) +
  ';\nconst ASSETS = ' + JSON.stringify(assets) + ';\n' + worker);
if (existsSync('.openai/hosting.json')) {
  await mkdir('dist/.openai', {recursive:true});
  await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
}
