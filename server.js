
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// ============================================================================
// APP INITIALIZATION
// ============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// CONFIGURATION
// ============================================================================
const ADMIN_NAME = 'panda cafe 777';
const ADMIN_PHONE = '+99987654321';

// Telegram Configuration - REPLACE WITH YOUR DATA
const TELEGRAM_BOT_TOKEN = '8697873901:AAFaX7BE0WTWIPmreGb7GpiAp2mvyruaNZU'; // Get from @BotFather
const TELEGRAM_CHAT_ID = '8406121228'; // Get from @userinfobot

// ============================================================================
// DIRECTORIES SETUP
// ============================================================================
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================================================
// DATA FILES INITIALIZATION
// ============================================================================
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const RESERVATIONS_FILE = path.join(DATA_DIR, 'reservations.json');

// Initialize products if not exists
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([
    {
      id: 1,
      name: 'Эспрессо',
      price: 18,
      desc: 'Крепкий, чистый вкус',
      img: '/uploads/espresso.jpg'
    },
    {
      id: 2,
      name: 'Капучино',
      price: 25,
      desc: 'С бархатной пенкой',
      img: '/uploads/cappuccino.jpg'
    },
    {
      id: 3,
      name: 'Латте',
      price: 28,
      desc: 'Авторский арт',
      img: '/uploads/latte.jpg'
    }
  ], null, 2));
}

// Initialize reservations if not exists
if (!fs.existsSync(RESERVATIONS_FILE)) {
  fs.writeFileSync(RESERVATIONS_FILE, '[]');
}

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'panda-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function readProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}

function writeProducts(data) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
}

function readReservations() {
  return JSON.parse(fs.readFileSync(RESERVATIONS_FILE, 'utf8'));
}

function writeReservations(data) {
  fs.writeFileSync(RESERVATIONS_FILE, JSON.stringify(data, null, 2));
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// ============================================================================
// ROUTES - MAIN PAGES
// ============================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panda-cafe.html'));
});

// ============================================================================
// ROUTES - AUTHENTICATION
// ============================================================================
app.post('/api/admin/login', (req, res) => {
  const { name, number } = req.body;

  if (name?.toLowerCase().trim() === ADMIN_NAME && number?.trim() === ADMIN_PHONE) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }

  res.status(403).json({ error: 'Неверные данные' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ============================================================================
// ROUTES - PRODUCTS API
// ============================================================================
app.get('/api/products', (req, res) => {
  res.json(readProducts());
});

app.post('/api/products', requireAuth, (req, res) => {
  const products = readProducts();
  const newItem = {
    id: Date.now(),
    name: req.body.name,
    price: Number(req.body.price),
    desc: req.body.desc || '',
    img: req.body.img || ''
  };
  products.push(newItem);
  writeProducts(products);
  res.json(newItem);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const products = readProducts();
  const id = Number(req.params.id);
  const idx = products.findIndex(p => p.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Not found' });
  }

  products[idx] = {...products[idx],...req.body, price: Number(req.body.price) };
  writeProducts(products);
  res.json(products[idx]);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  let products = readProducts();
  products = products.filter(p => p.id!== Number(req.params.id));
  writeProducts(products);
  res.json({ ok: true });
});

// ============================================================================
// ROUTES - RESERVATIONS API
// ============================================================================
app.post('/api/reserve', async (req, res) => {
  const { name, phone, date, time, guests } = req.body;

  const reservations = readReservations();
  const newRes = {
    id: Date.now(),
    name,
    phone,
    date,
    time,
    guests,
    created: new Date().toISOString()
  };

  reservations.unshift(newRes);
  writeReservations(reservations);

  // Send Telegram notification
  if (TELEGRAM_BOT_TOKEN!== 'PASTE_TOKEN_INJO') {
    const text = `🐼 НОВАЯ БРОНЬ PANDA CAFE!\n\n👤 Имя: ${name}\n📞 Телефон: ${phone}\n📅 Дата: ${date}\n🕒 Время: ${time}\n👥 Гостей: ${guests}\n\n⏰ ${new Date().toLocaleString('ru-RU')}`;

    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text
        })
      });
    } catch (e) {
      console.error('Telegram error:', e);
    }
  }

  res.json({ ok: true });
});

app.get('/api/reservations', requireAuth, (req, res) => {
  res.json(readReservations());
});

// ============================================================================
// ROUTES - IMAGE UPLOAD
// ============================================================================
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file' });
    }

    const filename = `panda-${Date.now()}.webp`;
    const filepath = path.join(UPLOAD_DIR, filename);

    await sharp(req.file.buffer)
     .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
     .webp({ quality: 75 })
     .toFile(filepath);

    res.json({ url: `/uploads/${filename}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ============================================================================
// ROUTES - ADMIN PANEL
// ============================================================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PANDA Admin</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
    body{font-family:system-ui;background:#FFF8F0;margin:0;color:#2B1E16}
   .wrap{max-width:1000px;margin:40px auto;padding:20px}
   .card{background:white;padding:24px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);margin-bottom:20px}
    input,textarea,button{width:100%;padding:12px;margin:6px 0;border:1px solid #ddd;border-radius:10px;font-size:15px}
    button{background:#5C3D2E;color:white;cursor:pointer;font-weight:600}
    button:hover{background:#D97D54}
   .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
   .item{border:1px solid #eee;border-radius:12px;overflow:hidden;background:#fff}
   .item img{width:100%;height:140px;object-fit:cover}
   .item-body{padding:10px}
   .actions{display:flex;gap:6px}
   .actions button{flex:1;padding:8px;font-size:13px}
   .hidden{display:none}
   .res-item{padding:12px;border-bottom:1px solid #eee;background:#fafafa;margin-bottom:8px;border-radius:8px}
   .res-item:last-child{border:none}
   .badge{background:#D97D54;color:white;padding:2px 8px;border-radius:12px;font-size:12px}
  </style>
</head>
<body>
<div class="wrap">
  <h1><i class="fa-solid fa-paw"></i> PANDA CAFE Admin</h1>

  <div id="login" class="card">
    <h3>Вход</h3>
    <input id="name" placeholder="Имя">
    <input id="phone" placeholder="Номер">
    <button onclick="login()">Войти</button>
    <p id="err" style="color:red"></p>
  </div>

  <div id="panel" class="hidden">
    <div class="card">
      <h3>🔔 Бронирования <span class="badge" id="resCount">0</span></h3>
      <div id="reservations">Загрузка...</div>
    </div>

    <div class="card">
      <h3>Добавить продукт</h3>
      <input id="pname" placeholder="Название">
      <input id="pprice" type="number" placeholder="Цена TJS">
      <textarea id="pdesc" placeholder="Описание"></textarea>
      <input type="file" id="pimg" accept="image/*">
      <button onclick="addProduct()">Добавить</button>
    </div>

    <div class="card">
      <h3>Меню (редактировать)</h3>
      <div id="list" class="grid"></div>
    </div>
    <button onclick="logout()" style="background:#999">Выйти</button>
  </div>
</div>

<script>
async function login(){
  const res = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('name').value, number:document.getElementById('phone').value})});
  if(res.ok){
    document.getElementById('login').classList.add('hidden');
    document.getElementById('panel').classList.remove('hidden');
    load();
    loadReservations();
  } else {
    document.getElementById('err').innerText='Неверно';
  }
}

async function logout(){
  await fetch('/api/admin/logout',{method:'POST'});
  location.reload();
}

async function uploadImg(file){
  const fd=new FormData();
  fd.append('image',file);
  const r=await fetch('/api/upload',{method:'POST',body:fd});
  const j=await r.json();
  return j.url;
}

async function addProduct(){
  let img='';
  const f=document.getElementById('pimg').files[0];
  if(f) img=await uploadImg(f);
  await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:pname.value,price:pprice.value,desc:pdesc.value,img})});
  pname.value='';pprice.value='';pdesc.value='';pimg.value='';
  load();
}

async function load(){
  const r=await fetch('/api/products');
  const items=await r.json();
  list.innerHTML = items.map(p=>\`
    <div class="item">
      <img src="\${p.img || 'https://via.placeholder.com/300'}" alt="">
      <div class="item-body">
        <b>\${p.name}</b> - \${p.price} TJS<br><small>\${p.desc}</small>
        <div class="actions">
          <button onclick="edit(\${p.id})">Изм</button>
          <button onclick="del(\${p.id})" style="background:#a33">Удал</button>
        </div>
      </div>
    </div>\`).join('');
}

async function loadReservations(){
  const r=await fetch('/api/reservations');
  const data=await r.json();
  document.getElementById('resCount').innerText = data.length;
  if(data.length===0){
    reservations.innerHTML='<p>Пока нет броней</p>';
    return;
  }
  reservations.innerHTML = data.map(x=>\`
    <div class="res-item">
      <b>📅 \${x.date} в \${x.time}</b> — 👤 \${x.name}
      <a href="tel:\${x.phone}" style="color:#5C3D2E">\${x.phone}</a><br>
      👥 \${x.guests} человека | 🕒 \${new Date(x.created).toLocaleString('ru-RU')}
    </div>\`).join('');
}

async function del(id){
  if(confirm('Удалить?')){
    await fetch('/api/products/'+id,{method:'DELETE'});
    load();
  }
}

async function edit(id){
  const name=prompt('Новое название:');
  if(!name) return;
  const price=prompt('Новая цена:');
  await fetch('/api/products/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,price})});
  load();
}

// Auto-refresh reservations every 15 seconds
setInterval(()=>{
  if(!document.getElementById('panel').classList.contains('hidden')) {
    loadReservations();
  }
},15000);
</script>
</body></html>`);
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log(`PANDA CAFE running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});

module.exports = app;