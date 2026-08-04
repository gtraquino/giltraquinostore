// ╔══════════════════════════════════════════════════════════════╗
// ║          🛍️  GiltraquinoStore — Backend Completo             ║
// ║                                                              ║
// ║  COMO USAR:                                                  ║
// ║  1. npm install express bcryptjs jsonwebtoken cors           ║
// ║               dotenv morgan helmet lowdb@1 uuid              ║
// ║  2. node giltraquino-server.js                               ║
// ║  3. Abra http://localhost:4000/api/health                    ║
// ║                                                              ║
// ║  Admin: admin@giltraquinostore.ao  |  Senha: Admin@2025      ║
// ╚══════════════════════════════════════════════════════════════╝

'use strict';

// ── Dependências ──────────────────────────────────────────────
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const morgan     = require('morgan');
const helmet     = require('helmet');
const low        = require('lowdb');
const FileSync   = require('lowdb/adapters/FileSync');
const { v4: uuid } = require('uuid');
const path       = require('path');
const fs         = require('fs');

// ── Configuração ───────────────────────────────────────────────
const CONFIG = {
  PORT          : process.env.PORT           || 4000,
  JWT_SECRET    : process.env.JWT_SECRET     || 'giltraquino_secret_angola_2025',
  JWT_EXPIRES   : process.env.JWT_EXPIRES_IN || '7d',
  ADMIN_EMAIL   : process.env.ADMIN_EMAIL    || 'admin@giltraquinostore.ao',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@2025',
  DB_FILE       : process.env.DB_FILE        || path.join(__dirname, 'giltraquino-db.json'),
};

// ══════════════════════════════════════════════════════════════
//  BASE DE DADOS (JSON — lowdb v1)
// ══════════════════════════════════════════════════════════════
const adapter = new FileSync(CONFIG.DB_FILE);
const db = low(adapter);

db.defaults({
  users: [], products: [], categories: [],
  orders: [], clients: [], payments: [],
  deliveryZones: [], settings: {},
}).write();

function seedDatabase() {
  // Admin
  if (!db.get('users').find({ role: 'admin' }).value()) {
    db.get('users').push({
      id: uuid(), name: 'Administrador',
      email: CONFIG.ADMIN_EMAIL,
      password: bcrypt.hashSync(CONFIG.ADMIN_PASSWORD, 10),
      role: 'admin', phone: '+244 923 000 000',
      createdAt: new Date().toISOString(), active: true,
    }).write();
    console.log('✅ Admin criado:', CONFIG.ADMIN_EMAIL);
  }

  // Categorias
  if (!db.get('categories').size().value()) {
    [
      { name: 'Alimentação',       emoji: '🍽️' },
      { name: 'Moda & Vestuário',  emoji: '👗' },
      { name: 'Tecnologia',        emoji: '📱' },
      { name: 'Serviços',          emoji: '🔧' },
      { name: 'Saúde & Beleza',    emoji: '💄' },
      { name: 'Casa & Decoração',  emoji: '🪑' },
      { name: 'Desporto',          emoji: '⚽' },
      { name: 'Materiais',         emoji: '🏗️' },
    ].forEach(c => db.get('categories').push({ id: uuid(), ...c, active: true, createdAt: new Date().toISOString() }).write());
  }

  // Produtos demo
  if (!db.get('products').size().value()) {
    const catId = db.get('categories').find({ name: 'Moda & Vestuário' }).value()?.id;
    [
      { name: 'Camisa Social Premium', description: 'Algodão de alta qualidade, várias cores', price: 8500,  stock: 50 },
      { name: 'Calças Jeans Slim',     description: 'Ganga slim fit, confortável',             price: 12990, stock: 30 },
      { name: 'Sapatilhas Desportivas',description: 'Ideais para treino e dia-a-dia',          price: 19500, stock: 20 },
    ].forEach(p => db.get('products').push({
      id: uuid(), ...p, category: catId, image: null,
      active: true, sales: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).write());
  }

  // Zonas de entrega
  if (!db.get('deliveryZones').size().value()) {
    [
      { name: 'Luanda Centro',       fee: 500  },
      { name: 'Talatona / Luanda Sul', fee: 800 },
      { name: 'Viana / Cacuaco',     fee: 1200 },
      { name: 'Benguela',            fee: 3500 },
      { name: 'Outras Províncias',   fee: 5000 },
    ].forEach(z => db.get('deliveryZones').push({ id: uuid(), ...z, active: true }).write());
  }

  // Definições da loja
  if (!Object.keys(db.get('settings').value() || {}).length) {
    db.set('settings', {
      storeName: 'GiltraquinoStore', currency: 'Kz',
      storeEmail: 'geral@giltraquinostore.ao',
      storePhone: '+244 923 000 000',
      storeAddress: 'Luanda, Angola',
      whatsapp: '+244923000000',
      instagram: '@giltraquinostore',
      facebook: 'GiltraquinoStore',
      acceptMulticaixa: true, acceptContaMovel: true,
      acceptUnitelMoney: true, acceptTransferencia: true, acceptEntrega: true,
      minOrderValue: 0, freeDeliveryAbove: 50000,
    }).write();
  }
}

// ══════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ══════════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Token de acesso necessário. Faça login primeiro.' });

  try {
    const decoded = jwt.verify(header.split(' ')[1], CONFIG.JWT_SECRET);
    const user = db.get('users').find({ id: decoded.id }).value();
    if (!user || !user.active)
      return res.status(401).json({ success: false, message: 'Utilizador inactivo ou não encontrado.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Acesso reservado a administradores.' });
  next();
}

// ══════════════════════════════════════════════════════════════
//  SERVIDOR EXPRESS
// ══════════════════════════════════════════════════════════════
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Pasta de uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Seed
seedDatabase();

// ══════════════════════════════════════════════════════════════
//  ROTAS — SAÚDE & LOJA PÚBLICA
// ══════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'online', store: db.get('settings.storeName').value(), timestamp: new Date().toISOString() });
});

app.get('/api/store', (req, res) => {
  const s = db.get('settings').value();
  res.json({ success: true, data: {
    storeName: s.storeName, currency: s.currency,
    storePhone: s.storePhone, storeAddress: s.storeAddress,
    whatsapp: s.whatsapp, instagram: s.instagram, facebook: s.facebook,
    paymentMethods: {
      multicaixa: s.acceptMulticaixa, contaMovel: s.acceptContaMovel,
      unitelMoney: s.acceptUnitelMoney, transferencia: s.acceptTransferencia, entrega: s.acceptEntrega,
    },
  }});
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — AUTENTICAÇÃO
// ══════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'E-mail e palavra-passe são obrigatórios.' });

  const user = db.get('users').find(u => u.email.toLowerCase() === email.toLowerCase()).value();
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ success: false, message: 'E-mail ou palavra-passe incorrectos.' });
  if (!user.active)
    return res.status(401).json({ success: false, message: 'Conta desactivada. Contacte o suporte.' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, CONFIG.JWT_SECRET, { expiresIn: CONFIG.JWT_EXPIRES });
  res.json({ success: true, message: 'Login efectuado com sucesso.', token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { password, ...safe } = req.user;
  res.json({ success: true, user: safe });
});

// PUT /api/auth/change-password
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, message: 'Palavra-passe actual e nova são obrigatórias.' });
  if (newPassword.length < 6)
    return res.status(400).json({ success: false, message: 'A nova palavra-passe deve ter pelo menos 6 caracteres.' });

  const user = db.get('users').find({ id: req.user.id }).value();
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(400).json({ success: false, message: 'Palavra-passe actual incorrecta.' });

  db.get('users').find({ id: req.user.id }).assign({ password: bcrypt.hashSync(newPassword, 10) }).write();
  res.json({ success: true, message: 'Palavra-passe alterada com sucesso.' });
});

// POST /api/auth/register  (admin cria funcionários)
app.post('/api/auth/register', authMiddleware, adminOnly, (req, res) => {
  const { name, email, password, role = 'staff', phone = '' } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: 'Nome, e-mail e palavra-passe são obrigatórios.' });

  if (db.get('users').find(u => u.email.toLowerCase() === email.toLowerCase()).value())
    return res.status(409).json({ success: false, message: 'Já existe um utilizador com esse e-mail.' });

  const newUser = { id: uuid(), name, email, password: bcrypt.hashSync(password, 10), role, phone, createdAt: new Date().toISOString(), active: true };
  db.get('users').push(newUser).write();
  const { password: _, ...safe } = newUser;
  res.status(201).json({ success: true, message: 'Utilizador criado.', user: safe });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — PRODUTOS
// ══════════════════════════════════════════════════════════════

// GET /api/products
app.get('/api/products', (req, res) => {
  const { category, search, minPrice, maxPrice, page = 1, limit = 20, sort = 'createdAt' } = req.query;
  let list = db.get('products').filter({ active: true }).value();

  if (category)  list = list.filter(p => p.category === category);
  if (search)    list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description||'').toLowerCase().includes(search.toLowerCase()));
  if (minPrice)  list = list.filter(p => p.price >= Number(minPrice));
  if (maxPrice)  list = list.filter(p => p.price <= Number(maxPrice));

  if (sort === 'price_asc')  list.sort((a,b) => a.price - b.price);
  else if (sort === 'price_desc') list.sort((a,b) => b.price - a.price);
  else if (sort === 'popular')    list.sort((a,b) => (b.sales||0) - (a.sales||0));
  else list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const cats = db.get('categories').value();
  const total = list.length;
  const paginated = list.slice((page-1)*limit, page*limit).map(p => ({
    ...p, categoryName: cats.find(c => c.id === p.category)?.name || '—',
  }));
  res.json({ success: true, data: paginated, total, page: Number(page), pages: Math.ceil(total/limit) });
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  const p = db.get('products').find({ id: req.params.id }).value();
  if (!p) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  res.json({ success: true, data: p });
});

// POST /api/products  (admin)
app.post('/api/products', authMiddleware, adminOnly, (req, res) => {
  const { name, description = '', price, stock = 0, category = null, image = null } = req.body;
  if (!name || price === undefined)
    return res.status(400).json({ success: false, message: 'Nome e preço são obrigatórios.' });
  if (isNaN(price) || Number(price) < 0)
    return res.status(400).json({ success: false, message: 'Preço inválido.' });

  const product = { id: uuid(), name, description, price: Number(price), stock: Number(stock), category, image, active: true, sales: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.get('products').push(product).write();
  res.status(201).json({ success: true, message: 'Produto criado.', data: product });
});

// PUT /api/products/:id  (admin)
app.put('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  const product = db.get('products').find({ id: req.params.id }).value();
  if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

  const allowed = ['name','description','price','stock','category','image','active'];
  const updates = { updatedAt: new Date().toISOString() };
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.price !== undefined) updates.price = Number(updates.price);
  if (updates.stock !== undefined) updates.stock = Number(updates.stock);

  db.get('products').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, message: 'Produto actualizado.', data: { ...product, ...updates } });
});

// DELETE /api/products/:id  (admin)
app.delete('/api/products/:id', authMiddleware, adminOnly, (req, res) => {
  if (!db.get('products').find({ id: req.params.id }).value())
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  db.get('products').remove({ id: req.params.id }).write();
  res.json({ success: true, message: 'Produto eliminado.' });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — ENCOMENDAS
// ══════════════════════════════════════════════════════════════
const ORDER_STATUSES = ['pendente','confirmado','em_preparacao','em_entrega','entregue','cancelado'];

// POST /api/orders  (público — cliente encomenda)
app.post('/api/orders', (req, res) => {
  const { clientName, clientPhone, clientEmail='', clientAddress='', deliveryZone, items=[], paymentMethod='a_definir', notes='' } = req.body;
  if (!clientName || !clientPhone || !items.length)
    return res.status(400).json({ success: false, message: 'Nome, telefone e produtos são obrigatórios.' });

  let subtotal = 0;
  const enrichedItems = [];
  for (const item of items) {
    const prod = db.get('products').find({ id: item.productId, active: true }).value();
    if (!prod) return res.status(400).json({ success: false, message: `Produto "${item.productId}" não encontrado.` });
    if (prod.stock < item.qty) return res.status(400).json({ success: false, message: `Stock insuficiente para "${prod.name}".` });
    const lineTotal = prod.price * item.qty;
    subtotal += lineTotal;
    enrichedItems.push({ productId: prod.id, name: prod.name, price: prod.price, qty: item.qty, lineTotal });
  }

  const zone = deliveryZone ? db.get('deliveryZones').find({ id: deliveryZone }).value() : null;
  const settings = db.get('settings').value();
  const deliveryFee = subtotal >= (settings.freeDeliveryAbove||999999) ? 0 : (zone?.fee || 0);
  const total = subtotal + deliveryFee;
  const orderNumber = `GT-${String(db.get('orders').size().value() + 1).padStart(5,'0')}`;

  const order = {
    id: uuid(), orderNumber, status: 'pendente',
    clientName, clientPhone, clientEmail, clientAddress,
    deliveryZone: zone?.name || 'Sem entrega', deliveryFee,
    items: enrichedItems, subtotal, total,
    paymentMethod, paymentStatus: 'pendente', notes,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  db.get('orders').push(order).write();

  // Deduzir stock
  enrichedItems.forEach(i => {
    db.get('products').find({ id: i.productId })
      .update('stock', s => s - i.qty)
      .update('sales', s => (s||0) + i.qty)
      .write();
  });

  // Registar/actualizar cliente
  const existing = db.get('clients').find(c => c.phone === clientPhone).value();
  if (existing) {
    db.get('clients').find({ phone: clientPhone })
      .update('totalOrders', n => n + 1)
      .update('totalSpent', n => n + total)
      .assign({ lastOrderAt: new Date().toISOString() }).write();
  } else {
    db.get('clients').push({
      id: uuid(), name: clientName, phone: clientPhone, email: clientEmail, address: clientAddress,
      totalOrders: 1, totalSpent: total, createdAt: new Date().toISOString(), lastOrderAt: new Date().toISOString(),
    }).write();
  }

  res.status(201).json({ success: true, message: 'Encomenda criada com sucesso!', data: { orderNumber, total, id: order.id } });
});

// GET /api/orders  (admin)
app.get('/api/orders', authMiddleware, (req, res) => {
  const { status, search, page=1, limit=20, dateFrom, dateTo } = req.query;
  let list = db.get('orders').value().slice().reverse();
  if (status)   list = list.filter(o => o.status === status);
  if (search)   list = list.filter(o => o.orderNumber.includes(search) || o.clientName.toLowerCase().includes(search.toLowerCase()) || o.clientPhone.includes(search));
  if (dateFrom) list = list.filter(o => new Date(o.createdAt) >= new Date(dateFrom));
  if (dateTo)   list = list.filter(o => new Date(o.createdAt) <= new Date(dateTo));

  const total = list.length;
  res.json({ success: true, data: list.slice((page-1)*limit, page*limit), total, page: Number(page), pages: Math.ceil(total/limit) });
});

// GET /api/orders/:id  (admin)
app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const order = db.get('orders').find(o => o.id === req.params.id || o.orderNumber === req.params.id).value();
  if (!order) return res.status(404).json({ success: false, message: 'Encomenda não encontrada.' });
  res.json({ success: true, data: order });
});

// PUT /api/orders/:id/status  (admin)
app.put('/api/orders/:id/status', authMiddleware, adminOnly, (req, res) => {
  const { status, paymentStatus } = req.body;
  const order = db.get('orders').find({ id: req.params.id }).value();
  if (!order) return res.status(404).json({ success: false, message: 'Encomenda não encontrada.' });
  if (status && !ORDER_STATUSES.includes(status))
    return res.status(400).json({ success: false, message: `Estado inválido. Opções: ${ORDER_STATUSES.join(', ')}` });

  if (status === 'cancelado' && order.status !== 'cancelado') {
    order.items.forEach(i => db.get('products').find({ id: i.productId }).update('stock', s => s + i.qty).write());
  }

  const updates = { updatedAt: new Date().toISOString() };
  if (status) updates.status = status;
  if (paymentStatus) updates.paymentStatus = paymentStatus;
  db.get('orders').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, message: 'Encomenda actualizada.', data: { ...order, ...updates } });
});

// DELETE /api/orders/:id  (admin)
app.delete('/api/orders/:id', authMiddleware, adminOnly, (req, res) => {
  if (!db.get('orders').find({ id: req.params.id }).value())
    return res.status(404).json({ success: false, message: 'Encomenda não encontrada.' });
  db.get('orders').remove({ id: req.params.id }).write();
  res.json({ success: true, message: 'Encomenda eliminada.' });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — DASHBOARD
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/dashboard', authMiddleware, (req, res) => {
  const orders   = db.get('orders').value();
  const products = db.get('products').value();
  const clients  = db.get('clients').value();
  const now      = new Date();
  const todayStr = now.toISOString().slice(0,10);
  const monthStr = now.toISOString().slice(0,7);

  const paid = o => o.status !== 'cancelado';
  const todayOrders  = orders.filter(o => o.createdAt.startsWith(todayStr));
  const monthOrders  = orders.filter(o => o.createdAt.startsWith(monthStr));
  const activeOrders = orders.filter(o => ['pendente','confirmado','em_preparacao','em_entrega'].includes(o.status));

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6-i));
    const day = d.toISOString().slice(0,10);
    const dayO = orders.filter(o => o.createdAt.startsWith(day) && paid(o));
    return { date: day, revenue: dayO.reduce((s,o) => s+o.total,0), count: dayO.length };
  });

  const byStatus = {};
  orders.forEach(o => { byStatus[o.status] = (byStatus[o.status]||0)+1; });

  res.json({ success: true, data: {
    summary: {
      totalOrders: orders.length, todayOrders: todayOrders.length,
      activeOrders: activeOrders.length, totalProducts: products.length,
      totalClients: clients.length,
      totalRevenue:  orders.filter(paid).reduce((s,o)=>s+o.total,0),
      monthRevenue:  monthOrders.filter(paid).reduce((s,o)=>s+o.total,0),
      todayRevenue:  todayOrders.filter(paid).reduce((s,o)=>s+o.total,0),
    },
    last7Days: last7,
    topProducts: products.slice().sort((a,b)=>(b.sales||0)-(a.sales||0)).slice(0,5)
      .map(p=>({ id:p.id, name:p.name, sales:p.sales||0, revenue:(p.sales||0)*p.price, stock:p.stock })),
    lowStock: products.filter(p=>p.stock<=5&&p.active).map(p=>({ id:p.id, name:p.name, stock:p.stock })),
    ordersByStatus: byStatus,
    recentOrders: orders.slice().reverse().slice(0,8)
      .map(o=>({ id:o.id, orderNumber:o.orderNumber, clientName:o.clientName, total:o.total, status:o.status, createdAt:o.createdAt })),
  }});
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — CATEGORIAS
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/categories', (req, res) => {
  const cats = db.get('categories').value();
  const prods = db.get('products').value();
  res.json({ success: true, data: cats.map(c => ({ ...c, productCount: prods.filter(p=>p.category===c.id).length })) });
});
app.post('/api/admin/categories', authMiddleware, adminOnly, (req, res) => {
  const { name, emoji='📦' } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nome é obrigatório.' });
  const cat = { id: uuid(), name, emoji, active: true, createdAt: new Date().toISOString() };
  db.get('categories').push(cat).write();
  res.status(201).json({ success: true, message: 'Categoria criada.', data: cat });
});
app.put('/api/admin/categories/:id', authMiddleware, adminOnly, (req, res) => {
  if (!db.get('categories').find({ id: req.params.id }).value())
    return res.status(404).json({ success: false, message: 'Categoria não encontrada.' });
  const updates = {};
  ['name','emoji','active'].forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  db.get('categories').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, message: 'Categoria actualizada.' });
});
app.delete('/api/admin/categories/:id', authMiddleware, adminOnly, (req, res) => {
  db.get('categories').remove({ id: req.params.id }).write();
  res.json({ success: true, message: 'Categoria eliminada.' });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — CLIENTES
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/clients', authMiddleware, (req, res) => {
  const { search, page=1, limit=20 } = req.query;
  let list = db.get('clients').value().slice().reverse();
  if (search) list = list.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.email||'').toLowerCase().includes(search.toLowerCase())
  );
  const total = list.length;
  res.json({ success: true, data: list.slice((page-1)*limit, page*limit), total });
});
app.get('/api/admin/clients/:id', authMiddleware, (req, res) => {
  const client = db.get('clients').find({ id: req.params.id }).value();
  if (!client) return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
  const orders = db.get('orders').filter(o => o.clientPhone === client.phone).value();
  res.json({ success: true, data: { ...client, orders } });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — DEFINIÇÕES DA LOJA
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/settings', authMiddleware, (req, res) => {
  res.json({ success: true, data: db.get('settings').value() });
});
app.put('/api/admin/settings', authMiddleware, adminOnly, (req, res) => {
  db.set('settings', { ...db.get('settings').value(), ...req.body, updatedAt: new Date().toISOString() }).write();
  res.json({ success: true, message: 'Definições guardadas.', data: db.get('settings').value() });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — ZONAS DE ENTREGA
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/delivery-zones', (req, res) => {
  res.json({ success: true, data: db.get('deliveryZones').value() });
});
app.post('/api/admin/delivery-zones', authMiddleware, adminOnly, (req, res) => {
  const { name, fee } = req.body;
  if (!name || fee===undefined) return res.status(400).json({ success: false, message: 'Nome e taxa são obrigatórios.' });
  const zone = { id: uuid(), name, fee: Number(fee), active: true };
  db.get('deliveryZones').push(zone).write();
  res.status(201).json({ success: true, message: 'Zona criada.', data: zone });
});
app.put('/api/admin/delivery-zones/:id', authMiddleware, adminOnly, (req, res) => {
  const updates = {};
  ['name','fee','active'].forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.fee) updates.fee = Number(updates.fee);
  db.get('deliveryZones').find({ id: req.params.id }).assign(updates).write();
  res.json({ success: true, message: 'Zona actualizada.' });
});
app.delete('/api/admin/delivery-zones/:id', authMiddleware, adminOnly, (req, res) => {
  db.get('deliveryZones').remove({ id: req.params.id }).write();
  res.json({ success: true, message: 'Zona eliminada.' });
});

// ══════════════════════════════════════════════════════════════
//  ROTAS — UTILIZADORES (admin)
// ══════════════════════════════════════════════════════════════
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  res.json({ success: true, data: db.get('users').value().map(({ password, ...u }) => u) });
});
app.put('/api/admin/users/:id/toggle', authMiddleware, adminOnly, (req, res) => {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
  if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Não pode desactivar o administrador principal.' });
  db.get('users').find({ id: req.params.id }).assign({ active: !user.active }).write();
  res.json({ success: true, message: `Utilizador ${user.active ? 'desactivado' : 'activado'}.` });
});

// ══════════════════════════════════════════════════════════════
//  HANDLERS DE ERRO
// ══════════════════════════════════════════════════════════════
app.use((req, res) => res.status(404).json({ success: false, message: `Rota ${req.method} ${req.path} não encontrada.` }));
app.use((err, req, res, next) => { console.error('❌', err.message); res.status(500).json({ success: false, message: 'Erro interno do servidor.' }); });

// ══════════════════════════════════════════════════════════════
//  ARRANQUE
// ══════════════════════════════════════════════════════════════
app.get('/admin',(req,res)=>res.sendFile(require('path').join(__dirname,'giltraquino-admin.html')));
app.get('/loja',(req,res)=>res.sendFile(require('path').join(__dirname,'giltraquinostore.html')));

app.get('/loja',(req,res)=>res.sendFile(p.join(__dirname,'giltraquinostore.html')));
app.get('/admin',(req,res)=>res.sendFile(p.join(__dirname,'giltraquino-admin.html')));
app.get('/admin',(req,res)=>res.sendFile(p.join(__dirname,'giltraquino-admin.html')));
app.get('/loja',(req,res)=>res.sendFile(p.join(__dirname,'giltraquinostore.html')));
app.listen(CONFIG.PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       🛍️  GiltraquinoStore — API Online      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🚀  http://localhost:${CONFIG.PORT}                  ║`);
  console.log(`║  🔐  Admin : ${CONFIG.ADMIN_EMAIL}  ║`);
  console.log(`║  🔑  Senha : ${CONFIG.ADMIN_PASSWORD}                   ║`);
  console.log(`║  💾  DB    : giltraquino-db.json             ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  ENDPOINTS PRINCIPAIS:                       ║');
  console.log('║  POST /api/auth/login     ← fazer login      ║');
  console.log('║  GET  /api/products       ← ver produtos     ║');
  console.log('║  POST /api/orders         ← criar encomenda  ║');
  console.log('║  GET  /api/admin/dashboard← painel admin     ║');
  console.log('║  GET  /api/health         ← estado servidor  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});