const bcrypt    = require('bcryptjs');
const { getDb } = require('../config/db');

exports.getRegister = (req, res) =>
  res.render('pages/register', { title:'Join HeartLink', error:null });

exports.postRegister = async (req, res) => {
  try {
    const db = await getDb();
    const { name, email, password, age, gender, interested_in, bio, interests } = req.body;
    if (!name||!email||!password||!age||!gender)
      return res.render('pages/register',{title:'Join HeartLink',error:'Please fill in all required fields.'});
    if (password.length < 6)
      return res.render('pages/register',{title:'Join HeartLink',error:'Password must be at least 6 characters.'});
    const clean = email.toLowerCase().trim();
    const existing = await db.prepare('SELECT id FROM users WHERE email=?').get(clean);
    if (existing)
      return res.render('pages/register',{title:'Join HeartLink',error:'An account with that email already exists.'});
    const hashed = await bcrypt.hash(password, 10);
    const interestsJson = JSON.stringify(interests?(Array.isArray(interests)?interests:[interests]):[]);
    const avatar = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await db.prepare(
      `INSERT INTO users (name,email,password,age,gender,interested_in,bio,interests,avatar) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(name.trim(),clean,hashed,parseInt(age)||18,gender,interested_in||'everyone',bio||'',interestsJson,avatar);
    console.log(`✅ Registered: ${clean} id=${result.lastInsertRowid}`);
    req.session.userId   = result.lastInsertRowid;
    req.session.userName = name.trim();
    req.session.userRole = 'user';
    req.session.save(err => { if(err)console.error('Session save:',err); res.redirect('/dashboard'); });
  } catch(err) {
    console.error('Register error:',err.message);
    res.render('pages/register',{title:'Join HeartLink',error:'Something went wrong. Please try again.'});
  }
};

exports.getLogin = (req, res) =>
  res.render('pages/login', { title:'Sign In', error:null });

exports.postLogin = async (req, res) => {
  try {
    const db    = await getDb();
    const email = (req.body.email||'').toLowerCase().trim();
    const pass  = (req.body.password||'');
    if (!email||!pass)
      return res.render('pages/login',{title:'Sign In',error:'Please enter your email and password.'});
    const user = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) {
      console.log(`❌ Login: no user ${email}`);
      return res.render('pages/login',{title:'Sign In',error:'No account found with that email. Please register first.'});
    }
    if (!user.is_active)
      return res.render('pages/login',{title:'Sign In',error:'Your account has been suspended. Contact support.'});
    const ok = await bcrypt.compare(pass, user.password);
    if (!ok) {
      console.log(`❌ Login: wrong password ${email}`);
      return res.render('pages/login',{title:'Sign In',error:'Incorrect password. Please try again.'});
    }
    console.log(`✅ Login: ${email} role=${user.role}`);
    req.session.userId   = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role||'user';
    req.session.save(err => {
      if (err) { console.error('Session save:',err); return res.render('pages/login',{title:'Sign In',error:'Session error — please try again.'}); }
      res.redirect(user.role==='admin'?'/admin':'/dashboard');
    });
  } catch(err) {
    console.error('Login error:',err.message);
    res.render('pages/login',{title:'Sign In',error:'Something went wrong. Please try again.'});
  }
};

exports.logout = (req, res) => req.session.destroy(() => res.redirect('/'));
