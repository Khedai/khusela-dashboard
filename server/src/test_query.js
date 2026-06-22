const pool = require('./config/db');

async function test() {
  try {
    const res = await pool.query(
      `SELECT n.*, u.username
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC
       LIMIT 10`
    );
    console.log('--- RECENT NOTIFICATIONS ---');
    for (const row of res.rows) {
      console.log(`User: ${row.username}`);
      console.log(`Title: "${row.title}"`);
      console.log(`Message: "${row.message}"`);
      console.log(`Link: "${row.link}"`);
      console.log(`Read: ${row.is_read}`);
      console.log('---------------------------');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

test();
