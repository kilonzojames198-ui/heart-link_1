const { getDb } = require('../config/db');

exports.getProfile = async (req, res) => {
  const db   = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!user) return res.redirect('/auth/login');
  try { user.interests = JSON.parse(user.interests||'[]'); } catch { user.interests=[]; }
  res.render('pages/profile',{title:'My Profile',user,error:null,success:null});
};

exports.updateProfile = async (req, res) => {
  const db = await getDb();
  const {name,age,gender,interested_in,bio,interests} = req.body;
  const interestsJson = JSON.stringify(interests?(Array.isArray(interests)?interests:[interests]):[]);
  const avatar = req.file?`/uploads/${req.file.filename}`:(req.body.current_avatar||null);
  await db.prepare(`UPDATE users SET name=?,age=?,gender=?,interested_in=?,bio=?,interests=?,avatar=? WHERE id=?`)
    .run(name.trim(),parseInt(age)||18,gender,interested_in||'everyone',bio||'',interestsJson,avatar,req.session.userId);
  req.session.userName = name.trim();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  try { user.interests=JSON.parse(user.interests||'[]'); } catch { user.interests=[]; }
  res.render('pages/profile',{title:'My Profile',user,error:null,success:'Profile updated!'});
};
