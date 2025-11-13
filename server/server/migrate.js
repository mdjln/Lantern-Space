// server/migrate.js
const db = require('./db');
(async ()=>{
  try{
    await db.init();
    console.log('Migration complete');
    process.exit(0);
  }catch(err){
    console.error(err);
    process.exit(1);
  }
})();
