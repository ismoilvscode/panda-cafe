const express = require('express');
const session = require('express-session');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`PANDA CAFE running on ${PORT}`));
}
module.exports = app;

// --- CONFIG ---
const ADMIN_NAME = 'panda cafe 777';
const ADMIN_PHONE = '+99987654321';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([
    {id:1,name:'Эспрессо',price:18,desc:'Крепкий, чистый вкус',img:'/uploads/espresso.jpg'},
    {id:2,name:'Капучино',price:25,desc:'С бархатной пенкой',img:'/uploads/cappuccino.jpg'},
    {id:3,name:'Латте',price:28,desc:'Авторский арт',img:'/uploads/latte.jpg'}
  ], null, 2));
}

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'panda-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*8 }
}));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve main site
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','panda-cafe.html')));

// --- AUTH ---
function requireAuth(req,res,next){
  if(req.session && req.session.isAdmin) return next();
  return res.status(401).json({error:'Unauthorized'});
}

app.post('/api/admin/login', (req,res)=>{
  const {name, number} = req.body;
  if(name?.toLowerCase().trim() === ADMIN_NAME && number?.trim() === ADMIN_PHONE){
    req.session.isAdmin = true;
    return res.json({ok:true});
  }
  res.status(403).json({error:'Неверные данные'});
});

app.post('/api/admin/logout', (req,res)=>{
  req.session.destroy(()=>res.json({ok:true}));
});

// --- PRODUCTS API ---
function readProducts(){
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE,'utf8'));
}
function writeProducts(data){
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data,null,2));
}

app.get('/api/products', (req,res)=>{
  res.json(readProducts());
});

app.post('/api/products', requireAuth, (req,res)=>{
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

app.put('/api/products/:id', requireAuth, (req,res)=>{
  const products = readProducts();
  const id = Number(req.params.id);
  const idx = products.findIndex(p=>p.id===id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  products[idx] = {...products[idx], ...req.body, price:Number(req.body.price)};
  writeProducts(products);
  res.json(products[idx]);
});

app.delete('/api/products/:id', requireAuth, (req,res)=>{
  let products = readProducts();
  products = products.filter(p=>p.id!==Number(req.params.id));
  writeProducts(products);
  res.json({ok:true});
});

// --- IMAGE UPLOAD with compression ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/api/upload', requireAuth, upload.single('image'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file'});
    const filename = `panda-${Date.now()}.webp`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    // Compress: resize max 800px, webp quality 75
    await sharp(req.file.buffer)
      .resize({width:800, height:800, fit:'inside', withoutEnlargement:true})
      .webp({quality:75})
      .toFile(filepath);
    
    res.json({url:`/uploads/${filename}`});
  }catch(e){
    console.error(e);
    res.status(500).json({error:'Upload failed'});
  }
});

// --- ADMIN PANEL HTML ---
app.get('/admin', (req,res)=>{
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
  if(res.ok){document.getElementById('login').classList.add('hidden');document.getElementById('panel').classList.remove('hidden');load();}
  else document.getElementById('err').innerText='Неверно';
}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});location.reload();}
async function uploadImg(file){
  const fd=new FormData();fd.append('image',file);
  const r=await fetch('/api/upload',{method:'POST',body:fd});
  const j=await r.json();return j.url;
}
async function addProduct(){
  let img=''; const f=document.getElementById('pimg').files[0]; if(f) img=await uploadImg(f);
  await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:pname.value,price:pprice.value,desc:pdesc.value,img})});
  pname.value='';pprice.value='';pdesc.value='';pimg.value='';load();
}
async function load(){
  const r=await fetch('/api/products'); const items=await r.json();
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
async function del(id){if(confirm('Удалить?')){await fetch('/api/products/'+id,{method:'DELETE'});load();}}
async function edit(id){
  const name=prompt('Новое название:'); if(!name) return;
  const price=prompt('Новая цена:'); 
  await fetch('/api/products/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,price})});
  load();
}
</script>
</body></html>`);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`PANDA CAFE running`));
}
module.exports = app;
