// server/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbFile = process.env.SQLITE_FILE || path.join(__dirname, 'lantern.db');
const db = new sqlite3.Database(dbFile);

function run(sql, params=[]) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err){
    if(err) return reject(err); resolve(this);
  }));
}
function all(sql, params=[]) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
    if(err) return reject(err); resolve(rows);
  }));
}
function get(sql, params=[]) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => {
    if(err) return reject(err); resolve(row);
  }));
}

module.exports = {
  async init(){
    await run(`CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      text TEXT,
      channel TEXT,
      state TEXT,
      ts INTEGER
    )`);
    await run(`CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT,
      kind TEXT,
      count INTEGER DEFAULT 0
    )`);
    await run(`CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, target TEXT, details TEXT, ts INTEGER)`);
  },
  async createPost({ text, channel='confess-here', state='held' }){
    const id = Math.random().toString(36).slice(2);
    const ts = Date.now();
    await run('INSERT INTO posts (id,text,channel,state,ts) VALUES (?,?,?,?,?)',[id,text,channel,state,ts]);
    return { id, text, channel, state, ts };
  },
  async getPublishedPosts(channel){
    if(channel) return all('SELECT * FROM posts WHERE state = ? AND channel = ? ORDER BY ts DESC',['published', channel]);
    return all('SELECT * FROM posts WHERE state = ? ORDER BY ts DESC',['published']);
  },
  async getAllPosts(){
    return all('SELECT * FROM posts ORDER BY ts DESC');
  },
  async updatePost(id, { state, text }){
    if(state) await run('UPDATE posts SET state = ? WHERE id = ?',[state,id]);
    if(text) await run('UPDATE posts SET text = ? WHERE id = ?',[text,id]);
    return get('SELECT * FROM posts WHERE id = ?',[id]);
  },
  async deletePost(id){
    await run('DELETE FROM posts WHERE id = ?',[id]);
    await run('DELETE FROM reactions WHERE post_id = ?',[id]);
  },
  async addReaction(id, kind){
    const row = await get('SELECT * FROM reactions WHERE post_id = ? AND kind = ?',[id,kind]);
    if(row) await run('UPDATE reactions SET count = count + 1 WHERE id = ?',[row.id]);
    else await run('INSERT INTO reactions (post_id,kind,count) VALUES (?,?,1)',[id,kind]);
    const post = await get('SELECT * FROM posts WHERE id = ?',[id]);
    const reactions = await all('SELECT kind,count FROM reactions WHERE post_id = ?',[id]);
    post.reactions = reactions.reduce((acc,r)=>{ acc[r.kind]=r.count; return acc; },{});
    return post;
  },
  async flagPostForReview(id, reason){
    await run('UPDATE posts SET state = ? WHERE id = ?',['held', id]);
    await run('INSERT INTO audit (action,target,details,ts) VALUES (?,?,?,?)',['flagged', id, reason, Date.now()]);
  },
  async logAudit({ action, target, details }){
    await run('INSERT INTO audit (action,target,details,ts) VALUES (?,?,?,?)',[action,target,JSON.stringify(details||{}),Date.now()]);
  }
};
