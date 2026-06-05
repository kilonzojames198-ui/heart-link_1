function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/auth/login');
}
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  next();
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.userRole === 'admin') return next();
  res.status(403).render('pages/error', { title: 'Access Denied', message: 'Admin access required.' });
}
module.exports = { requireAuth, redirectIfAuth, requireAdmin };
