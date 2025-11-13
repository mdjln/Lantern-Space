// server/moderation.js -- naive moderation & rate-limit for demo
const bans = ['suicide','kill','bomb','attack','shut up','die'];
let ipCounts = {};

module.exports = {
  checkForFlags(text){
    const lc = (text||'').toLowerCase();
    return bans.some(b => lc.includes(b));
  },
  rateLimitMiddleware(req, res, next){
    const ip = (req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || 'unknown').split(',')[0].trim();
    ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    if(ipCounts[ip] > 300) return res.status(429).json({ error: 'rate limit exceeded' });
    // decay the counter after 60s
    setTimeout(()=>{ ipCounts[ip] = Math.max(0,(ipCounts[ip]||1)-1); }, 60*1000);
    next();
  }
};
