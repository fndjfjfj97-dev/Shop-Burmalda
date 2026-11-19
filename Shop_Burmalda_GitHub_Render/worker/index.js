const catalog = {
  rabbit: {name: 'Заяц Бурмалдаець', price: 50},
  bird: {name: 'Мама Пташка', price: 50}
};
const shipping = {nova: 'Нова пошта', ukr: 'Укрпошта'};
const encoder = new TextEncoder();
const identifier = /^[a-f0-9-]{36}$/;
const buyerToken = /^[a-f0-9]{64}$/;
const error = (status, message) => json({error: message}, status);

function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', ...headers}});
}
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function equalSecret(left, right) {
  const [a,b] = await Promise.all([digest(left), digest(right)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sellerSession(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get('Cookie')?.match(/(?:^|; *)burmalda_seller=([a-f0-9]{64})(?:;|$)/)?.[1];
  return !!cookie && await equalSecret(cookie, await digest('burmalda-seller-session:' + secret));
}
function orderView(row) {
  const saved = JSON.parse(row.items);
  const items = Array.isArray(saved) ? saved : Object.entries(saved).map(([id, quantity]) => ({id, ...catalog[id], quantity}));
  return {id: row.id, name: row.name, shipping: shipping[row.shipping], status: row.status,
    created: row.created, items, total: items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100};
}
async function listProducts(db) {
  const {results} = await db.prepare('SELECT id, name, price FROM products ORDER BY rowid').all();
  return [...Object.entries(catalog).map(([id, product]) => ({id, ...product})), ...results];
}
function jpegBytes(value) {
  if (typeof value !== 'string' || value.length > 730000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const raw = atob(value);
    if (!raw.startsWith('\xff\xd8\xff') || !raw.endsWith('\xff\xd9')) return null;
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  } catch { return null; }
}
async function routeApi(request, env, path) {
  const method = request.method;
  if (method !== 'GET') {
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return error(403, 'Дію заблоковано.');
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return error(403, 'Дію заблоковано.');
  }
  let body;
  if (method === 'POST' && path !== '/api/seller/logout') {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return error(415, 'Потрібен формат JSON.');
    const limit = path === '/api/seller/products' ? 750000 : 8192;
    if (Number(request.headers.get('Content-Length') || 0) > limit) return error(413, 'Запит завеликий.');
    try {
      const raw = await request.text();
      if (raw.length > limit) return error(413, 'Запит завеликий.');
      body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return error(400, 'Невірний формат запиту.'); }
  }
  const {DB: db, SELLER_PASSWORD: secret} = env;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  if (path === '/api/seller/login' && method === 'POST') {
    if (!secret) return error(503, 'Вхід до кабінету ще не налаштовано.');
    if (typeof body.password !== 'string' || body.password.length > 160 || !await equalSecret(body.password, secret)) {
      return error(401, 'Неправильний пароль.');
    }
    const cookie = await digest('burmalda-seller-session:' + secret);
    return json({ok: true}, 200, {'Set-Cookie': 'burmalda_seller=' + cookie + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200' + secure});
  }
  if (path === '/api/seller/logout' && method === 'POST') {
    return json({ok: true}, 200, {'Set-Cookie': 'burmalda_seller=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0' + secure});
  }
  const seller = await sellerSession(request, secret);
  if (path === '/api/seller/session' && method === 'GET') return json({seller});
  if (path === '/api/products' && method === 'GET') {
    return db ? json({products:await listProducts(db)}) : error(503, 'Каталог тимчасово недоступний.');
  }
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const sellerMode = path.startsWith('/api/seller/');
  if (sellerMode ? !seller : !buyerToken.test(token || '')) return error(401, 'Доступ до заявки обмежено.');
  if (!db) return error(503, 'Заявки тимчасово недоступні.');
  if (path === '/api/seller/products' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const {price, photo} = body;
    if (name.length < 2 || name.length > 80 || !Number.isFinite(price) || price < .01 || price > 100000 ||
        Math.abs(price * 100 - Math.round(price * 100)) > .00001 || !jpegBytes(photo)) {
      return error(400, 'Перевірте назву, ціну та фото фігурки.');
    }
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO products (id, name, price, photo) VALUES (?, ?, ?, ?)').bind(id, name, price, photo).run();
    return json({product:{id, name, price}}, 201);
  }
  const hash = token ? await digest(token) : '';
  if (path === '/api/orders' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const items = body.items;
    if (!identifier.test(body.id || '') || name.length < 2 || name.length > 60 ||
        !Object.hasOwn(shipping, body.shipping) || !items || Array.isArray(items) || typeof items !== 'object' ||
        !Object.keys(items).length || Object.values(items).some(count => !Number.isInteger(count) || count < 1 || count > 20)) {
      return error(400, 'Перевірте ім’я, доставку й кількість фігурок.');
    }
    const products = new Map((await listProducts(db)).map(product => [product.id, product]));
    const lines = Object.entries(items).map(([id, quantity]) => ({...products.get(id), quantity}));
    if (lines.some(product => !product.id)) return error(400, 'Фігурку не знайдено в каталозі.');
    await db.prepare('INSERT INTO orders (id, buyer_hash, name, shipping, items, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(body.id, hash, name, body.shipping, JSON.stringify(lines), new Date().toISOString()).run();
    const row = await db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_hash = ?').bind(body.id, hash).first();
    return row ? json({order: orderView(row)}, 201) : error(409, 'Почніть оформлення заявки ще раз.');
  }
  if ((path === '/api/orders' || path === '/api/seller/orders') && method === 'GET') {
    const stmt = sellerMode ? db.prepare('SELECT * FROM orders ORDER BY created DESC LIMIT 100') :
      db.prepare('SELECT * FROM orders WHERE buyer_hash = ? ORDER BY created DESC LIMIT 100').bind(hash);
    const {results} = await stmt.all();
    return json({orders: results.map(orderView)});
  }
  const match = path.match(/^\/api\/(?:seller\/)?orders\/([a-f0-9-]{36})(?:\/(messages|close))?$/);
  if (!match) return error(404, 'Сторінку не знайдено.');
  const [, id, action] = match;
  const row = sellerMode
    ? await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
    : await db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_hash = ?').bind(id, hash).first();
  if (!row) return error(404, 'Заявку не знайдено.');
  if (!action && method === 'GET') {
    const {results} = await db.prepare('SELECT role, message, created FROM (SELECT id, role, message, created FROM messages WHERE order_id = ? ORDER BY id DESC LIMIT 250) ORDER BY id').bind(id).all();
    return json({order: orderView(row), messages: results});
  }
  if (action === 'messages' && method === 'POST') {
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 1000) return error(400, 'Повідомлення має містити від 1 до 1000 символів.');
    const result = await db.prepare("INSERT INTO messages (order_id, role, message, created) SELECT id, ?, ?, ? FROM orders WHERE id = ? AND status = 'open'")
      .bind(sellerMode ? 'seller' : 'buyer', message, new Date().toISOString(), id).run();
    return result.meta.changes ? json({ok: true}, 201) : error(409, 'Діалог уже завершено.');
  }
  if (action === 'close' && method === 'POST' && sellerMode) {
    await db.prepare("UPDATE orders SET status = 'closed' WHERE id = ?").bind(id).run();
    return json({ok: true});
  }
  return error(404, 'Сторінку не знайдено.');
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await routeApi(request, env, path); }
      catch (e) { console.error('shop API', e.message); return error(503, 'Сервіс тимчасово недоступний. Спробуйте ще раз.'); }
    }
    if (path === '/' || path === '/seller' || path === '/seller/') {
      const title = path === '/' ? 'Shop Burmalda · Магазин 3D-фігурок' : 'Кабінет продавця · Shop Burmalda';
      return new Response(PAGE.replace('PAGE_TITLE', title), {headers: {
        'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"
      }});
    }
    const asset = ASSETS[path];
    if (asset) {
      const value = asset.type.startsWith('image/') ? Uint8Array.from(atob(asset.value), c => c.charCodeAt(0)) : asset.value;
      return new Response(value, {headers: {'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600'}});
    }
    const image = path.match(/^\/products\/([0-9a-f-]{36})\.jpg$/);
    if (image && env.DB && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT photo FROM products WHERE id = ?').bind(image[1]).first();
      if (row) return new Response(jpegBytes(row.photo), {headers: {'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'}});
    }
    return new Response('Сторінку не знайдено', {status: 404});
  }
};
