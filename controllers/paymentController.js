const { getDb } = require('../config/db');
const Stripe    = require('stripe');

const PLANS = {
  plus: { name:'HeartLink Plus', amount_usd:9.99,  label:'Plus' },
  vip:  { name:'HeartLink VIP',  amount_usd:19.99, label:'VIP'  }
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return (key&&!key.startsWith('sk_test_your'))?Stripe(key):null;
}

exports.getPayPage = async (req, res) => {
  const plan = PLANS[req.params.plan];
  if (!plan) return res.redirect('/#pricing');
  const db   = await getDb();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  res.render('pages/payment-pay',{title:`Upgrade to ${plan.label}`,plan:req.params.plan,planDetails:plan,user,error:req.query.error||null,isLocalMode:!getStripe()});
};

exports.initiatePayment = async (req, res) => {
  const planKey = req.params.plan;
  const plan    = PLANS[planKey];
  if (!plan) return res.redirect('/#pricing');
  const db     = await getDb();
  const result = await db.prepare(`INSERT INTO payments (user_id,plan,amount_usd,status) VALUES (?,?,?,'pending')`).run(req.session.userId,planKey,plan.amount_usd);
  const payId  = result.lastInsertRowid;
  const stripe = getStripe();
  const appUrl = process.env.APP_URL||`http://localhost:${process.env.PORT||3000}`;
  if (!stripe) return res.redirect(`/payment/status/${payId}`);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types:['card'],mode:'payment',
      line_items:[{price_data:{currency:'usd',product_data:{name:plan.name},unit_amount:Math.round(plan.amount_usd*100)},quantity:1}],
      metadata:{paymentId:String(payId),plan:planKey},
      success_url:`${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${appUrl}/payment/cancelled?plan=${planKey}`
    });
    await db.prepare('UPDATE payments SET stripe_session_id=? WHERE id=?').run(session.id,payId);
    return res.redirect(303,session.url);
  } catch(err) {
    await db.prepare("UPDATE payments SET status='failed' WHERE id=?").run(payId);
    return res.redirect(`/payment/pay/${planKey}?error=${encodeURIComponent(err.message)}`);
  }
};

exports.paymentSuccess = async (req, res) => {
  const db=await getDb(),sessionId=req.query.session_id;
  if (sessionId) {
    const payment=await db.prepare('SELECT * FROM payments WHERE stripe_session_id=? AND user_id=?').get(sessionId,req.session.userId);
    if (payment&&payment.status==='pending') {
      await db.prepare("UPDATE payments SET status='confirmed',updated_at=NOW() WHERE id=?").run(payment.id);
      await db.prepare("UPDATE users SET plan=? WHERE id=?").run(payment.plan,payment.user_id);
    }
  }
  const p=sessionId?await db.prepare('SELECT * FROM payments WHERE stripe_session_id=?').get(sessionId):null;
  res.render('pages/payment-status',{title:'Payment Confirmed',status:'confirmed',plan:p?PLANS[p.plan]:null,payment:p});
};

exports.paymentCancelled = (req,res) =>
  res.render('pages/payment-status',{title:'Cancelled',status:'cancelled',plan:PLANS[req.query.plan]||null,payment:null});

exports.getStatus = async (req, res) => {
  const db=await getDb();
  const payment=await db.prepare('SELECT * FROM payments WHERE id=? AND user_id=?').get(parseInt(req.params.id),req.session.userId);
  if (!payment) return res.redirect('/dashboard');
  res.render('pages/payment-status',{title:'Payment Status',status:payment.status,plan:PLANS[payment.plan],payment,isLocalMode:!getStripe()});
};

exports.webhook = async (req, res) => {
  try {
    const stripe=getStripe();const sig=req.headers['stripe-signature'];const secret=process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe||!secret||secret.startsWith('whsec_your')) return res.json({received:true});
    const event=stripe.webhooks.constructEvent(req.body,sig,secret);
    if (event.type==='checkout.session.completed') {
      const db=await getDb(),s=event.data.object;
      const p=await db.prepare('SELECT * FROM payments WHERE stripe_session_id=?').get(s.id);
      if (p){await db.prepare("UPDATE payments SET status='confirmed',stripe_payment_intent=?,updated_at=NOW() WHERE id=?").run(s.payment_intent,p.id);await db.prepare("UPDATE users SET plan=? WHERE id=?").run(p.plan,p.user_id);}
    }
  } catch(e){console.error('Webhook:',e.message);}
  res.json({received:true});
};

exports.getHistory = async (req, res) => {
  const db=await getDb();
  const payments=await db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
  res.render('pages/payment-history',{title:'Payment History',payments,PLANS});
};

exports.testConfirm = async (req, res) => {
  if (process.env.NODE_ENV==='production') return res.status(403).json({error:'Not in production'});
  const db=await getDb();
  const payment=await db.prepare('SELECT * FROM payments WHERE id=?').get(parseInt(req.params.id));
  if (!payment) return res.status(404).json({error:'Not found'});
  const receipt='TEST_'+Date.now().toString().slice(-8);
  await db.prepare("UPDATE payments SET status='confirmed',stripe_receipt=?,updated_at=NOW() WHERE id=?").run(receipt,payment.id);
  await db.prepare("UPDATE users SET plan=? WHERE id=?").run(payment.plan,payment.user_id);
  res.json({success:true,receipt,plan:payment.plan});
};

module.exports.PLANS = PLANS;
