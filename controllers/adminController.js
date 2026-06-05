const { getDb } = require('../config/db');

exports.getDashboard = async (req, res) => {
  const db = await getDb();
  const g  = async (q, p=[]) => { const r=await db.prepare(q).get(p); return r; };
  const stats = {
    totalUsers:     Number((await g("SELECT COUNT(*) AS c FROM users WHERE role!='admin'"))?.c)||0,
    activeToday:    Number((await g("SELECT COUNT(*) AS c FROM users WHERE DATE(created_at)=CURRENT_DATE AND role!='admin'"))?.c)||0,
    totalMatches:   Number((await g("SELECT COUNT(*) AS c FROM matches"))?.c)||0,
    totalMessages:  Number((await g("SELECT COUNT(*) AS c FROM messages"))?.c)||0,
    totalPayments:  Number((await g("SELECT COUNT(*) AS c FROM payments WHERE status='confirmed'"))?.c)||0,
    revenue:        Number((await g("SELECT COALESCE(SUM(amount_usd),0) AS s FROM payments WHERE status='confirmed'"))?.s)||0,
    plusUsers:      Number((await g("SELECT COUNT(*) AS c FROM users WHERE plan='plus'"))?.c)||0,
    vipUsers:       Number((await g("SELECT COUNT(*) AS c FROM users WHERE plan='vip'"))?.c)||0,
    pendingReports: Number((await g("SELECT COUNT(*) AS c FROM reports WHERE status='pending'"))?.c)||0,
  };
  const recentUsers    = await db.prepare("SELECT id,name,email,plan,role,is_active,created_at FROM users WHERE role!='admin' ORDER BY created_at DESC LIMIT 10").all();
  const recentPayments = await db.prepare("SELECT p.*,u.name,u.email FROM payments p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 10").all();
  const reports        = await db.prepare("SELECT r.*,ru.name AS reporter_name,rd.name AS reported_name FROM reports r JOIN users ru ON r.reporter_id=ru.id JOIN users rd ON r.reported_id=rd.id ORDER BY r.created_at DESC LIMIT 20").all();
  res.render('pages/admin/dashboard',{title:'Admin Dashboard',stats,recentUsers,recentPayments,reports});
};

exports.getUsers = async (req, res) => {
  const db = await getDb();
  const q  = req.query.q||'';
  const users = q
    ? await db.prepare("SELECT * FROM users WHERE role!='admin' AND (name ILIKE ? OR email ILIKE ?) ORDER BY created_at DESC").all(`%${q}%`,`%${q}%`)
    : await db.prepare("SELECT * FROM users WHERE role!='admin' ORDER BY created_at DESC").all();
  res.render('pages/admin/users',{title:'Manage Users',users,q});
};

exports.toggleUser = async (req, res) => {
  const db   = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(parseInt(req.params.id));
  if (!user||user.role==='admin') return res.redirect('/admin/users');
  await db.prepare('UPDATE users SET is_active=? WHERE id=?').run(user.is_active?0:1,user.id);
  res.redirect('/admin/users');
};

exports.deleteUser = async (req, res) => {
  const db   = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(parseInt(req.params.id));
  if (!user||user.role==='admin') return res.redirect('/admin/users');
  await db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.redirect('/admin/users');
};

exports.resolveReport = async (req, res) => {
  const db = await getDb();
  await db.prepare("UPDATE reports SET status='resolved' WHERE id=?").run(parseInt(req.params.id));
  res.redirect('/admin');
};

exports.getPayments = async (req, res) => {
  const db       = await getDb();
  const payments = await db.prepare("SELECT p.*,u.name,u.email FROM payments p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC").all();
  const row      = await db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS s FROM payments WHERE status='confirmed'").get();
  res.render('pages/admin/payments',{title:'Payments',payments,total:Number(row?.s)||0});
};
