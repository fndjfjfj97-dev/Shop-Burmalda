import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {cloudflareDatabase} from './cloudflare-d1.mjs';
import worker from './dist/server/index.js';

const hosted = process.env.RENDER === 'true';
const publicOrigin = hosted ? new URL(process.env.RENDER_EXTERNAL_URL).origin : '';
if (hosted && (process.env.SELLER_PASSWORD?.length ?? 0) < 16) {
  throw new Error('Set SELLER_PASSWORD to at least 16 characters in Render.');
}
const migrations = [
  ['orders', '0000_shop.sql'],
  ['products', '0001_products.sql']
];
const readMigration = file => readFileSync(new URL('./drizzle/' + file,import.meta.url),'utf8');

function localPassword(state) {
  const file = join(state,'seller-password.txt');
  if (!existsSync(file)) writeFileSync(file,randomBytes(18).toString('base64url')+'\n',{flag:'wx',mode:0o600});
  return readFileSync(file,'utf8').trim();
}

function openDatabase(state) {
  const database = new DatabaseSync(join(state,'shop.sqlite'));
  for (const [table, file] of migrations) {
    if (database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    database.exec('BEGIN');
    try {
      database.exec(readMigration(file));
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  return {prepare(query) {
    const statement = database.prepare(query);
    const bind = params => ({
      bind: (...args) => bind(args),
      first: async () => statement.get(...params),
      all: async () => ({results:statement.all(...params)}),
      run: async () => ({meta:statement.run(...params)})
    });
    return bind([]);
  }};
}

function localEnvironment() {
  const state = fileURLToPath(new URL('./data/',import.meta.url));
  mkdirSync(state,{recursive:true});
  return {DB:openDatabase(state), SELLER_PASSWORD:localPassword(state)};
}

async function hostedEnvironment() {
  const DB = cloudflareDatabase(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.D1_DATABASE_ID, process.env.D1_API_TOKEN);
  const statements = migrations.flatMap(([,file]) => readMigration(file).split('--> statement-breakpoint'))
    .map(sql => sql.trim()).filter(Boolean)
    .map(sql => sql.replace(/^(CREATE TABLE|CREATE INDEX) /i,'$1 IF NOT EXISTS '));
  await DB.migrate(statements);
  return {DB, SELLER_PASSWORD:process.env.SELLER_PASSWORD};
}

const env = hosted ? await hostedEnvironment() : localEnvironment();
const port = Number(hosted ? (process.env.PORT || 10000) : (process.env.BURMALDA_PORT || 8765));
const origin = hosted ? publicOrigin : 'http://127.0.0.1:' + port;
const server = createServer(async (input, output) => {
  if (input.method === 'GET' && input.url === '/healthz') {
    output.writeHead(200, {'Content-Type':'text/plain'}).end('ok');
    return;
  }
  if (!hosted && input.headers.host !== '127.0.0.1:' + port && input.headers.host !== 'localhost:' + port) {
    output.writeHead(403).end(); return;
  }
  try {
    const chunks = [];
    let length = 0;
    const limit = input.url === '/api/seller/products' ? 750000 : 8192;
    for await (const chunk of input) {
      length += chunk.length;
      if (length > limit) {output.writeHead(413).end(); return;}
      chunks.push(chunk);
    }
    const requestOrigin = hosted ? publicOrigin : 'http://' + input.headers.host;
    if (!input.url?.startsWith('/') || input.url.startsWith('//')) {
      output.writeHead(400).end();
      return;
    }
    const request = new Request(requestOrigin + input.url,{
      method:input.method,
      headers:input.headers,
      body:input.method==='GET'||input.method==='HEAD'?undefined:Buffer.concat(chunks)
    });
    const response = await worker.fetch(request,env);
    output.writeHead(response.status,Object.fromEntries(response.headers));
    output.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error.message);
    if (!output.headersSent) output.writeHead(500);
    output.end();
  }
});
server.listen(port,hosted ? '0.0.0.0' : '127.0.0.1',()=>{
  console.log('Shop Burmalda: '+origin);
  console.log('Seller: '+origin+'/seller');
  if (!hosted) console.log('Local seller password: data/seller-password.txt');
});
