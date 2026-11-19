let products = [
  {id:'rabbit', name:'Заяц Бурмалдаець', price:50},
  {id:'bird', name:'Мама Пташка', price:50}
];
const img = id => '/products/' + id + '.jpg';
const seller = location.pathname.startsWith('/seller');
const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const drawer = document.querySelector('#drawer');
const drawerContent = document.querySelector('#drawer-content');
const toast = document.querySelector('#toast');
const icons = {
  bag:'<path d="M5 8h14l1.5 12h-17zM9 9V6a3 3 0 0 1 6 0v3"/>',
  truck:'<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
const icon = name => '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const money = n => new Intl.NumberFormat('uk-UA', {maximumFractionDigits:2}).format(n) + ' грн';
const shortId = id => '#' + id.slice(0,8).toUpperCase();
const date = str => new Date(str).toLocaleString('uk-UA', {timeZone:'Europe/Kyiv',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
const save = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));} catch {}};
let buyerKey = read('burmalda-buyer-key', '');
let cart = Object.assign(Object.create(null), read('burmalda-cart', {}));
let view = '', selected = '', pendingOrder = '', busy = false, sellerOnline = false, toastTimer;
let shownOrder = null, shownList = '', shownThread = '';

function buyerToken() {
  if (!/^[a-f0-9]{64}$/.test(buyerKey)) {
    buyerKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join('');
    save('burmalda-buyer-key', buyerKey);
  }
  return buyerKey;
}
async function api(path, body) {
  const headers = {};
  if (!seller && path !== 'products') headers.Authorization = 'Bearer ' + buyerToken();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const result = await fetch('/api/' + path, {method:body === undefined ? 'GET' : 'POST', headers,
    body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store'});
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const err = new Error(data.error || 'Помилка з’єднання. Спробуйте ще раз.');
    err.status = result.status;
    throw err;
  }
  return data;
}
function notify(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 2500);
}
const count = id => Number.isInteger(cart[id]) ? Math.max(0, Math.min(20, cart[id])) : 0;
const qty = () => products.reduce((sum, p) => sum + count(p.id), 0);
const total = () => products.reduce((sum, p) => sum + Math.round(p.price * 100) * count(p.id), 0) / 100;
function buyerNav() {
  nav.innerHTML = '<a class="desktop-only" href="#catalog">Каталог</a><a class="desktop-only" href="#delivery">Доставка</a>' +
    '<button class="button quiet" type="button" data-action="orders">Мої заявки</button>' +
    '<button class="button" type="button" data-action="cart" aria-label="Відкрити кошик">'+icon('bag')+'<span class="nav-cart-text">Кошик</span><span class="count" id="cart-count">'+qty()+'</span></button>';
}
function storefront() {
  buyerNav();
  app.innerHTML = '<section class="hero"><div class="hero-copy"><h1>Shop<br>Burmalda</h1><p>3D-фігурки з характером</p><a class="button lime" href="#catalog">Переглянути фігурки</a></div><div class="hero-art" aria-hidden="true"><img class="hero-figure" src="'+img('rabbit')+'" alt=""></div></section>' +
    '<section class="catalog" id="catalog"><div class="section-head"><h2>Каталог фігурок</h2></div><div class="cards">'+products.map(p =>
      '<article class="card"><button type="button" class="product-photo '+p.id+'" data-action="photo" data-id="'+p.id+'" aria-label="Збільшити фото: '+safe(p.name)+'"><img src="'+img(p.id)+'" alt="'+safe(p.name)+'"></button>'+
      '<div class="card-body"><div><h3>'+safe(p.name)+'</h3><span class="price">'+money(p.price)+'</span></div><button type="button" class="button" data-action="add" data-id="'+p.id+'">'+icon('plus')+'У кошик</button></div></article>').join('') +
      '</div></section><section class="delivery" id="delivery"><span>'+icon('truck')+'</span><div><h2>Доставка Україною</h2><p>Виберіть Нову пошту або Укрпошту під час оформлення заявки.</p></div></section>';
}
function openDrawer(title, body) {
  drawerContent.innerHTML = '<header class="drawer-header"><h2 id="drawer-title">'+safe(title)+'</h2><button type="button" data-action="dismiss" class="square" aria-label="Закрити">×</button></header><div class="drawer-body">'+body+'</div>';
  if (!drawer.open) drawer.showModal();
}
function showCart(focusId, focusAction) {
  view = 'cart';
  const rows = products.filter(p => count(p.id) > 0).map(p =>
    '<div class="cart-line"><img class="thumb" src="'+img(p.id)+'" alt=""><div><strong>'+safe(p.name)+'</strong><br><span class="muted">'+money(p.price * count(p.id))+'</span></div><div class="stepper"><button type="button" class="square" data-action="minus" data-id="'+p.id+'" aria-label="Зменшити кількість: '+safe(p.name)+'">−</button><span aria-label="Кількість">'+count(p.id)+'</span><button type="button" class="square" data-action="plus" data-id="'+p.id+'" aria-label="Збільшити кількість: '+safe(p.name)+'" '+(count(p.id) >= 20 ? 'disabled' : '')+'>+</button></div></div>').join('');
  openDrawer('Кошик', rows ? rows+'<div class="sum"><span>Разом за фігурки</span><span>'+money(total())+'</span></div><button type="button" class="button wide" data-action="checkout">Оформити</button>' : '<p class="muted">Ваш кошик порожній.</p><button type="button" class="button" data-action="dismiss">До каталогу</button>');
  if (focusId) (drawer.querySelector('[data-action="'+focusAction+'"][data-id="'+focusId+'"]:enabled') || drawer.querySelector('[data-action="checkout"], [data-action="dismiss"]'))?.focus();
}
function changeCart(id, increment, source) {
  if (busy || !products.some(p => p.id === id)) return;
  if (increment > 0 && count(id) >= 20) return notify('Максимум 20 фігурок одного виду у заявці.');
  cart[id] = Math.max(0, count(id) + increment);
  save('burmalda-cart',cart);
  document.querySelector('#cart-count').textContent = qty();
  pendingOrder = '';
  if (view === 'cart') showCart(id, source);
  if (source === 'add') notify('Фігурку додано в кошик');
}
function checkout() {
  if (!qty()) return showCart();
  view = 'checkout';
  if (!pendingOrder) pendingOrder = crypto.randomUUID();
  openDrawer('Оформлення заявки','<button type="button" class="text-button back" data-action="cart">Повернутися до кошика</button><form class="fields" id="checkout-form"><label class="field">Ваше ім’я<input name="name" autocomplete="given-name" minlength="2" maxlength="60" required placeholder="Введіть ім’я"></label><fieldset><legend>Спосіб відправлення</legend><label class="option"><input type="radio" name="shipping" value="nova" required><span>Нова пошта</span></label><label class="option"><input type="radio" name="shipping" value="ukr" required><span>Укрпошта</span></label></fieldset><p class="notice">Деталі доставки й оплати можна узгодити з продавцем у чаті після подачі заявки.</p><div class="sum"><span>Разом за фігурки</span><span>'+money(total())+'</span></div><p class="err" role="alert"></p><button class="button wide" type="submit">Подати заяву</button></form>');
}
const badge = order => '<span class="status'+(order.status === 'closed' ? ' closed':'')+'">'+(order.status === 'closed' ? 'Завершено':'Відкрито')+'</span>';
function showOrders() {
  view = 'orders'; selected = ''; shownList = '';
  openDrawer('Мої заявки','<div id="orders-list" class="order-list" aria-live="polite"><p class="empty">Завантаження…</p></div><p class="notice">Повертайтеся до цього розділу в тому самому браузері, щоб продовжити чат.</p>');
  loadOrders();
}
function sellerLogin(message = '') {
  sellerOnline = false; selected = '';
  nav.innerHTML = '<a href="/">До магазину</a>';
  app.innerHTML = '<section class="login"><h1>Кабінет продавця</h1><form class="fields" id="login-form"><label class="field">Пароль продавця<input type="password" name="password" autocomplete="current-password" required maxlength="160"></label><p class="err" role="alert">'+safe(message)+'</p><button class="button wide" type="submit">Увійти</button></form></section>';
}
function sellerDesk() {
  sellerOnline = true; shownList = ''; selected = ''; shownThread = '';
  nav.innerHTML = '<a href="/">До магазину</a><button type="button" class="button quiet" data-action="logout">Вийти</button>';
  app.innerHTML = '<header class="seller-heading seller-actions"><h1>Кабінет продавця</h1><button class="button" type="button" data-action="new-product">'+icon('plus')+'Додати фігурку</button></header><div class="desk"><section class="panel"><h2 class="panel-heading">Заявки покупців</h2><div id="orders-list" class="order-list" aria-live="polite"><p class="empty">Завантаження…</p></div></section><section class="panel" id="thread"><div class="placeholder">Виберіть заявку, щоб відкрити діалог.</div></section></div>';
  loadOrders();
}
function productForm() {
  openDrawer('Нова фігурка','<form class="fields" id="product-form"><label class="field">Фото<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label><label class="field">Назва<input name="name" minlength="2" maxlength="80" required></label><label class="field">Ціна, грн<input type="number" name="price" min="0.01" max="100000" step="0.01" required></label><p class="err" role="alert"></p><button class="button wide" type="submit">Розмістити</button></form>');
}
async function preparePhoto(file) {
  if (!file?.size || file.size > 12 * 1024 * 1024) throw new Error('Виберіть фото до 12 МБ.');
  let image;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('Не вдалося відкрити фото. Виберіть JPG, PNG або WebP.'); }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', {alpha:false});
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .86).split(',')[1];
  } finally { image.close(); }
}
const orderPath = () => seller ? 'seller/orders' : 'orders';
async function loadOrders() {
  const list = document.querySelector('#orders-list');
  if (!list) return;
  try {
    const {orders} = !seller && !buyerKey ? {orders:[]} : await api(orderPath());
    if (!list.isConnected) return;
    const markup = orders.map(o => '<button type="button" class="order-item" data-action="thread" data-id="'+o.id+'" aria-current="'+(selected===o.id)+'"><span><strong>'+safe(seller ? o.name : shortId(o.id))+'</strong><small>'+safe(o.shipping)+' · '+money(o.total)+' · '+date(o.created)+'</small></span>'+badge(o)+'</button>').join('') || '<p class="empty">Поки що немає заявок.</p>';
    if (markup !== shownList) {list.innerHTML = markup; shownList = markup;}
  } catch (e) {
    if (!list.isConnected) return;
    if (seller && e.status === 401) return sellerLogin('Увійдіть знову.');
    shownList = ''; list.innerHTML = '<p class="error-box">'+safe(e.message)+'</p>';
  }
}
function openThread(id) {
  selected = id; shownThread = ''; shownOrder = null;
  if (!seller) {
    view = 'thread';
    openDrawer('Чат із продавцем','<button type="button" class="text-button back" data-action="orders">Усі мої заявки</button><section id="thread"></section>');
  } else {
    for (const button of document.querySelectorAll('[data-action=thread]')) button.setAttribute('aria-current', String(button.dataset.id === selected));
  }
  document.querySelector('#thread').innerHTML = '<div class="placeholder">Завантаження діалогу…</div>';
  refreshThread();
}
function renderThread(shell, order, messages) {
  if (!shell.querySelector('.messages') || shownOrder?.status !== order.status) {
    shell.innerHTML = '<div class="chat-panel"><header class="chat-head"><h3>'+safe(seller ? order.name+' · '+shortId(order.id) : 'Заявка '+shortId(order.id))+'</h3>'+badge(order)+'</header><p class="summary">'+order.items.map(i => safe(i.name)+' × '+i.quantity).join(' · ')+'<br>'+safe(order.shipping)+' · '+money(order.total)+'</p><div class="messages" role="log" aria-label="Повідомлення"></div>' +
      (order.status === 'open'
      ? '<form id="message-form" class="send"><textarea name="message" rows="1" maxlength="1000" required placeholder="Напишіть повідомлення" aria-label="Повідомлення"></textarea><button class="button" type="submit">Надіслати</button></form><p class="err chat-error" role="alert"></p>' +
        (seller ? '<button type="button" class="text-button" data-action="close-thread">Завершити діалог</button>' : '')
      : '<p class="notice">Діалог завершено. Історія повідомлень збережена.</p>')+'</div>';
    shownThread = '';
  }
  shownOrder = order;
  const markup = messages.map(m => '<article class="message'+(m.role === (seller ? 'seller':'buyer')?' mine':'')+'"><small>'+ (m.role === 'seller' ? 'Продавець':'Покупець')+' · '+date(m.created)+'</small><p>'+safe(m.message)+'</p></article>').join('') || '<p class="empty">Повідомлень ще немає.</p>';
  const log = shell.querySelector('.messages');
  if (shownThread !== markup) {
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = markup; shownThread = markup;
    if (atEnd) log.scrollTop = log.scrollHeight;
  }
}
async function refreshThread() {
  const id = selected, shell = document.querySelector('#thread');
  if (!id || !shell) return;
  try {
    const {order,messages} = await api(orderPath()+'/'+id);
    if (selected === id && shell.isConnected) renderThread(shell,order,messages);
  } catch (e) {
    if (id !== selected || !shell.isConnected) return;
    if (seller && e.status === 401) return sellerLogin('Увійдіть знову.');
    if (!shell.querySelector('.messages')) shell.innerHTML = '<p class="error-box">'+safe(e.message)+'</p>';
  }
}
async function sellerInit() {
  sellerLogin();
  try { if ((await api('seller/session')).seller) sellerDesk(); }
  catch { sellerLogin('Не вдалося з’єднатися. Спробуйте увійти.'); }
}
document.addEventListener('click',async e => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const {action,id} = button.dataset;
  switch(action) {
    case 'add': case 'plus': case 'minus': return changeCart(id, action==='minus' ? -1 : 1, action);
    case 'cart': return showCart();
    case 'checkout': return checkout();
    case 'orders': return showOrders();
    case 'new-product': return productForm();
    case 'thread': return openThread(id);
    case 'dismiss': return drawer.close();
    case 'photo': {
      const p = products.find(p => p.id === id);
      view = 'photo'; return openDrawer(p.name,'<div class="photo-lightbox"><img src="'+img(p.id)+'" alt="'+safe(p.name)+'"></div>');
    }
    case 'logout': {
      try {await api('seller/logout',{}); sellerLogin();} catch(e){notify(e.message);} return;
    }
    case 'close-thread': {
      const order = selected;
      if (!order || !confirm('Завершити діалог за цією заявкою?')) return;
      button.disabled = true;
      try {await api(orderPath()+'/'+order+'/close',{}); await Promise.all([refreshThread(),loadOrders()]);}
      catch(e){notify(e.message);} finally {button.disabled=false;} return;
    }
  }
});
drawer.addEventListener('click', e => {if(e.target===drawer) drawer.close();});
drawer.addEventListener('close', () => {if (!seller) {view=''; selected='';}});
document.addEventListener('submit',async e => {
  const form = e.target;
  if (!['checkout-form','message-form','login-form','product-form'].includes(form.id)) return;
  e.preventDefault();
  const button = form.querySelector('button[type=submit],button:not([type])');
  if (button.disabled) return;
  const values = Object.fromEntries(new FormData(form)), error = form.parentElement.querySelector('.err') || form.querySelector('.err');
  button.disabled = true;
  if (error) error.textContent = '';
  try {
    if (form.id === 'checkout-form') {
      if (busy) return;
      busy = true;
      const items = Object.fromEntries(products.filter(p => count(p.id) > 0).map(p => [p.id,count(p.id)]));
      const {order} = await api('orders',{id:pendingOrder,items,...values});
      cart = Object.create(null);
      save('burmalda-cart',cart);
      document.querySelector('#cart-count').textContent = 0;
      pendingOrder = ''; openThread(order.id); notify('Заявку надіслано');
    } else if (form.id === 'login-form') {
      await api('seller/login',values);
      sellerDesk();
    } else if (form.id === 'product-form') {
      const photo = await preparePhoto(values.photo);
      await api('seller/products', {name:values.name, price:Number(values.price), photo});
      if (form.isConnected) drawer.close();
      notify('Фігурку додано до каталогу.');
    } else {
      await api(orderPath()+'/'+selected+'/messages',values);
      form.reset(); await refreshThread();
      form.querySelector('textarea')?.focus();
    }
  } catch(e) {
    if (error) error.textContent = e.message;
    else notify(e.message);
    if (e.status === 409 && form.id === 'message-form') await refreshThread();
  } finally {
    if (form.id === 'checkout-form') busy = false;
    button.disabled = false;
  }
});
setInterval(() => {
  if (document.hidden) return;
  if (sellerOnline || view === 'orders') loadOrders();
  if (selected) refreshThread();
}, 3200);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (sellerOnline || view === 'orders') loadOrders();
  if (selected) refreshThread();
  if (!seller) refreshCatalog();
});
async function refreshCatalog() {
  try {
    const response = await api('products');
    if (JSON.stringify(response.products) === JSON.stringify(products)) return;
    products = response.products;
    storefront();
    if (view === 'cart') showCart();
  } catch { /* Keep the available catalog during a connection interruption. */ }
}
if (seller) sellerInit(); else { storefront(); refreshCatalog(); }
