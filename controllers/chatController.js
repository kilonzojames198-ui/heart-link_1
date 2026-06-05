const { getDb } = require('../config/db');

async function getMatches(db, uid) {
  return db.prepare(`
    SELECT m.id AS match_id, u.id AS user_id, u.name, u.avatar,
      (SELECT content FROM messages WHERE match_id=m.id ORDER BY created_at DESC LIMIT 1) AS last_msg,
      (SELECT created_at FROM messages WHERE match_id=m.id ORDER BY created_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages WHERE match_id=m.id AND sender_id!=? AND read_at IS NULL) AS unread
    FROM matches m
    JOIN users u ON (CASE WHEN m.user1_id=? THEN m.user2_id ELSE m.user1_id END)=u.id
    WHERE (m.user1_id=? OR m.user2_id=?)
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=u.id)
    ORDER BY last_at DESC NULLS LAST
  `).all([uid,uid,uid,uid,uid]);
}

async function markRead(db, matchId, uid) {
  await db.prepare(`UPDATE messages SET read_at=NOW() WHERE match_id=? AND sender_id!=? AND read_at IS NULL`).run(matchId,uid);
}

exports.getChats = async (req, res) => {
  const db  = await getDb();
  const uid = req.session.userId;
  res.render('pages/chats',{title:'Messages',matches:await getMatches(db,uid),activeMatch:null,messages:[],currentUserId:uid,otherUser:null,isMuted:false});
};

exports.getChatRoom = async (req, res) => {
  const db      = await getDb();
  const uid     = req.session.userId;
  const matchId = parseInt(req.params.matchId);
  const match   = await db.prepare('SELECT * FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.redirect('/chats');
  const otherId   = match.user1_id===uid?match.user2_id:match.user1_id;
  const otherUser = await db.prepare('SELECT id,name,avatar,bio,age,interests FROM users WHERE id=?').get(otherId);
  if (otherUser?.interests) try{otherUser.interests=JSON.parse(otherUser.interests);}catch{otherUser.interests=[];}
  const muted    = await db.prepare('SELECT id FROM mutes WHERE user_id=? AND muted_id=?').get(uid,otherId);
  await markRead(db,matchId,uid);
  const messages = await db.prepare(`SELECT msg.*,u.name AS sender_name FROM messages msg JOIN users u ON msg.sender_id=u.id WHERE msg.match_id=? ORDER BY msg.created_at ASC`).all(matchId);
  const matches  = await getMatches(db,uid);
  res.render('pages/chats',{title:`Chat with ${otherUser.name}`,matches,activeMatch:{...match,other:otherUser},messages,currentUserId:uid,otherUser,isMuted:!!muted});
};

exports.sendMessage = async (req, res) => {
  const db      = await getDb();
  const uid     = req.session.userId;
  const matchId = parseInt(req.params.matchId);
  const content = req.body.content?.trim();
  if (!content&&!req.file) return res.redirect(`/chats/${matchId}`);
  const match = await db.prepare('SELECT id FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.redirect('/chats');
  const imageUrl = req.file?`/uploads/${req.file.filename}`:null;
  await db.prepare('INSERT INTO messages (match_id,sender_id,content,image_url) VALUES (?,?,?,?)').run(matchId,uid,content||'',imageUrl);
  res.redirect(`/chats/${matchId}`);
};

exports.pollMessages = async (req, res) => {
  const db      = await getDb();
  const uid     = req.session.userId;
  const matchId = parseInt(req.params.matchId);
  const since   = req.query.since||'1970-01-01';
  const match   = await db.prepare('SELECT id FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.status(403).json([]);
  await markRead(db,matchId,uid);
  const msgs = await db.prepare(`SELECT msg.*,u.name AS sender_name FROM messages msg JOIN users u ON msg.sender_id=u.id WHERE msg.match_id=? AND msg.created_at>? ORDER BY msg.created_at ASC`).all(matchId,since);
  res.json(msgs);
};

exports.unreadCount = async (req, res) => {
  const db  = await getDb();
  const uid = req.session.userId;
  const row = await db.prepare(`SELECT COUNT(*) AS total FROM messages msg JOIN matches m ON msg.match_id=m.id WHERE (m.user1_id=? OR m.user2_id=?) AND msg.sender_id!=? AND msg.read_at IS NULL`).get(uid,uid,uid);
  res.json({count:Number(row?.total)||0});
};

exports.reportUser = async (req, res) => {
  const db=await getDb(),uid=req.session.userId,matchId=parseInt(req.params.matchId);
  const match=await db.prepare('SELECT * FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.status(403).json({error:'Forbidden'});
  const reportedId=match.user1_id===uid?match.user2_id:match.user1_id;
  const {reason,detail}=req.body;
  const ex=await db.prepare('SELECT id FROM reports WHERE reporter_id=? AND match_id=?').get(uid,matchId);
  if (!ex) await db.prepare('INSERT INTO reports (reporter_id,reported_id,match_id,reason,detail) VALUES (?,?,?,?,?)').run(uid,reportedId,matchId,reason||'Other',detail||'');
  res.json({success:true,message:'Report submitted. Our team will review it within 24 hours.'});
};

exports.blockUser = async (req, res) => {
  const db=await getDb(),uid=req.session.userId,matchId=parseInt(req.params.matchId);
  const match=await db.prepare('SELECT * FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.status(403).json({error:'Forbidden'});
  try { await db.prepare('INSERT INTO blocks (blocker_id,blocked_id) VALUES (?,?)').run(uid,match.user1_id===uid?match.user2_id:match.user1_id); } catch(e){}
  res.json({success:true,redirect:'/chats'});
};

exports.unmatch = async (req, res) => {
  const db=await getDb(),uid=req.session.userId,matchId=parseInt(req.params.matchId);
  const match=await db.prepare('SELECT * FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.status(403).json({error:'Forbidden'});
  await db.prepare('DELETE FROM messages WHERE match_id=?').run(matchId);
  await db.prepare('DELETE FROM matches WHERE id=?').run(matchId);
  res.json({success:true,redirect:'/chats'});
};

exports.muteUser = async (req, res) => {
  const db=await getDb(),uid=req.session.userId,matchId=parseInt(req.params.matchId);
  const match=await db.prepare('SELECT * FROM matches WHERE id=? AND (user1_id=? OR user2_id=?)').get(matchId,uid,uid);
  if (!match) return res.status(403).json({error:'Forbidden'});
  const mutedId=match.user1_id===uid?match.user2_id:match.user1_id;
  const ex=await db.prepare('SELECT id FROM mutes WHERE user_id=? AND muted_id=?').get(uid,mutedId);
  if (ex) { await db.prepare('DELETE FROM mutes WHERE user_id=? AND muted_id=?').run(uid,mutedId); res.json({success:true,muted:false,message:'Notifications unmuted.'}); }
  else    { try{await db.prepare('INSERT INTO mutes (user_id,muted_id) VALUES (?,?)').run(uid,mutedId);}catch(e){} res.json({success:true,muted:true,message:'Notifications muted.'}); }
};
