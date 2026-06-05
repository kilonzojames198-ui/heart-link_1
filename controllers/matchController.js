const { getDb } = require('../config/db');

exports.getDashboard = async (req, res) => {
  try {
    const db  = await getDb();
    const uid = req.session.userId;
    const me  = await db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    if (!me) return res.redirect('/auth/login');
    me.interests = JSON.parse(me.interests||'[]');

    const swipedRows = await db.prepare('SELECT swiped_id FROM swipes WHERE swiper_id=?').all(uid);
    const swiped = swipedRows.map(r=>r.swiped_id);
    swiped.push(uid);

    // Build NOT IN clause
    const placeholders = swiped.map((_,i) => `?`).join(',');
    let q = `SELECT * FROM users WHERE id NOT IN (${placeholders}) AND role!='admin' AND is_active=1`;
    const params = [...swiped];
    if (me.interested_in !== 'everyone') { q += ' AND gender=?'; params.push(me.interested_in); }
    q += ' ORDER BY RANDOM() LIMIT 1';

    const profile = await db.prepare(q).get(params);
    if (profile) {
      profile.interests = JSON.parse(profile.interests||'[]');
      const shared = profile.interests.filter(i => me.interests.includes(i));
      profile.compatibility = Math.min(60 + shared.length * 10, 99);
    }

    const newMatches = await db.prepare(`
      SELECT m.id AS match_id, u.name, u.avatar FROM matches m
      JOIN users u ON (CASE WHEN m.user1_id=? THEN m.user2_id ELSE m.user1_id END)=u.id
      WHERE (m.user1_id=? OR m.user2_id=?)
      AND NOT EXISTS (SELECT 1 FROM messages WHERE match_id=m.id)
      ORDER BY m.created_at DESC LIMIT 10
    `).all([uid,uid,uid]);

    const recentChats = await db.prepare(`
      SELECT m.id AS match_id, u.name, u.avatar,
        (SELECT content FROM messages WHERE match_id=m.id ORDER BY created_at DESC LIMIT 1) AS last_msg,
        (SELECT COUNT(*) FROM messages WHERE match_id=m.id AND sender_id!=? AND read_at IS NULL) AS unread
      FROM matches m
      JOIN users u ON (CASE WHEN m.user1_id=? THEN m.user2_id ELSE m.user1_id END)=u.id
      WHERE (m.user1_id=? OR m.user2_id=?)
      AND EXISTS (SELECT 1 FROM messages WHERE match_id=m.id)
      ORDER BY (SELECT created_at FROM messages WHERE match_id=m.id ORDER BY created_at DESC LIMIT 1) DESC LIMIT 20
    `).all([uid,uid,uid,uid]);

    res.render('pages/dashboard',{title:'Explore',me,profile:profile||null,newMatches,recentChats,query:req.query});
  } catch(err) {
    console.error('Dashboard error:',err.message);
    res.render('pages/dashboard',{title:'Explore',me:{name:req.session.userName||'',interests:[]},profile:null,newMatches:[],recentChats:[],query:req.query});
  }
};

exports.postSwipe = async (req, res) => {
  try {
    const db  = await getDb();
    const uid = req.session.userId;
    const { swiped_id, action } = req.body;
    if (!swiped_id||!action) return res.redirect('/dashboard');
    try {
      await db.prepare('INSERT INTO swipes (swiper_id,swiped_id,action) VALUES (?,?,?)').run(uid,parseInt(swiped_id),action);
    } catch(e) { /* duplicate — ignore */ }
    if (action==='like'||action==='superlike') {
      const their = await db.prepare('SELECT action FROM swipes WHERE swiper_id=? AND swiped_id=?').get(parseInt(swiped_id),uid);
      if (their&&(their.action==='like'||their.action==='superlike')) {
        const [u1,u2] = [uid,parseInt(swiped_id)].sort((a,b)=>a-b);
        try { await db.prepare('INSERT INTO matches (user1_id,user2_id) VALUES (?,?)').run(u1,u2); } catch(e){}
        const matched = await db.prepare('SELECT name FROM users WHERE id=?').get(parseInt(swiped_id));
        return res.redirect(`/dashboard?matched=${encodeURIComponent(matched.name)}`);
      }
    }
    res.redirect('/dashboard');
  } catch(err) {
    console.error('Swipe error:',err.message);
    res.redirect('/dashboard');
  }
};
