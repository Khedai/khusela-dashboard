const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
  try {
    // 1. Create a default franchise first
    const franchiseResult = await pool.query(
      `INSERT INTO franchises (franchise_name, location)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Khusela Head Office', 'South Africa']
    );

    let franchiseId;

    if (franchiseResult.rows.length > 0) {
      franchiseId = franchiseResult.rows[0].id;
    } else {
      // Already exists, fetch it
      const existing = await pool.query(
        'SELECT id FROM franchises WHERE franchise_name = $1',
        ['Khusela Head Office']
      );
      franchiseId = existing.rows[0].id;
    }

    console.log('Franchise ID:', franchiseId);

    // 2. Hash the admin password
    const passwordHash = await bcrypt.hash('Admin@1234', 10);

    // 3. Create the admin user
    const userResult = await pool.query(
      `INSERT INTO users (franchise_id, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, role`,
      [franchiseId, 'admin', passwordHash, 'Admin']
    );

    if (userResult.rows.length > 0) {
      console.log('Admin user created:', userResult.rows[0]);
    } else {
      console.log('Admin user already exists, skipping.');
    }

    console.log('Seed complete.');
    process.exit(0);

  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();