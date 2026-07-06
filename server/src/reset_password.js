const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function reset() {
  try {
    const username = process.argv[2] || 'Dawn';
    const newPassword = process.argv[3] || 'Pixel#87';

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING username, role, is_active',
      [hash, username]
    );

    if (result.rows.length === 0) {
      console.log(`User "${username}" not found.`);
    } else {
      const u = result.rows[0];
      console.log(`Password reset for: ${u.username} (${u.role}, active: ${u.is_active !== false})`);
      console.log(`New password: ${newPassword}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
}

reset();