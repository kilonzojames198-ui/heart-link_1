require('dotenv').config();
const express        = require('express');
const path           = require('path');
const session        = require('express-session');
const helmet         = require('helmet');
const methodOverride = require('method-override');
const fs             = require('fs');
const { getDb }      = require('./config/db');

const app = express();

// Trust Vercel/Render proxy for secure cookies over HTTPS
app.set('trust proxy', 1);

// Ensure upload dir exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Sessions
app.use(session({
  secret:            process.env.SESSION_SECRET || 'heartlink_dev_secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Expose session user to all views
app.use((req, res, next) => {
  res.locals.sessionUser = req.session.userId
    ? { id: req.session.userId, name: req.session.userName, role: req.session.userRole }
    : null;
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const db  = await getDb();
    const row = await db.prepare('SELECT COUNT(*) AS c FROM users').get();
    res.json({ status: 'ok', users: Number(row?.c)||0, env: process.env.NODE_ENV||'development', time: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('pages/landing', { title: 'HeartLink — Find Your Person' });
});

app.use('/auth',      require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/profile',   require('./routes/profile'));
app.use('/chats',     require('./routes/chats'));
app.use('/payment',   require('./routes/payment'));
app.use('/admin',     require('./routes/admin'));

['about','careers','press','contact','safety','community','blog','help','privacy','terms'].forEach(slug => {
  app.get('/'+slug, (req, res) => res.render('pages/'+slug, { title: slug.charAt(0).toUpperCase()+slug.slice(1) }));
});

app.use((req, res) => res.status(404).render('pages/404', { title: 'Page Not Found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('pages/error', { title: 'Something went wrong', message: err.message });
});

const PORT = process.env.PORT || 3000;
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`💖  HeartLink → http://localhost:${PORT}`);
    console.log(`🔑  Admin    → http://localhost:${PORT}/admin`);
    console.log(`${'='.repeat(50)}\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });

module.exports = app;
