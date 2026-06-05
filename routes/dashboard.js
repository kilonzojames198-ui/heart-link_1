const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/matchController');
router.get('/',     requireAuth, ctrl.getDashboard);
router.post('/swipe', requireAuth, ctrl.postSwipe);
module.exports = router;
