const pool = require('./config/db');

async function fix() {
  const line = '='.repeat(70);
  console.log(line);
  console.log('  KHUSELA - FIX EMPLOYEE-USER LINKING ISSUES');
  console.log(line + '\n');

  // -- 1. Link Rashaad De Vries (employee ce5203a6...) to user "Rashaad" --
  const rashaadUser = await pool.query(
    `SELECT id, username FROM users WHERE LOWER(username) = 'rashaad' AND is_active = true`
  );
  const rashaadEmp = await pool.query(
    `SELECT id, first_name, last_name FROM employees WHERE id = 'ce5203a6-7aca-48eb-9e74-da125caf49b6'`
  );

  if (rashaadUser.rows.length === 1 && rashaadEmp.rows.length === 1) {
    // Clear any existing link from this user to another employee first
    await pool.query('UPDATE employees SET user_id = NULL WHERE user_id = $1 AND id != $2',
      [rashaadUser.rows[0].id, rashaadEmp.rows[0].id]);
    await pool.query('UPDATE employees SET user_id = $1 WHERE id = $2',
      [rashaadUser.rows[0].id, rashaadEmp.rows[0].id]);
    console.log(`  [FIXED] Linked employee "${rashaadEmp.rows[0].first_name} ${rashaadEmp.rows[0].last_name}" -> user "${rashaadUser.rows[0].username}"`);
  } else {
    console.log(`  [SKIP] Rashaad: user found=${rashaadUser.rows.length}, employee found=${rashaadEmp.rows.length}`);
  }

  // -- 2. Link Stacy Teera (employee bfcd0194...) to user "StacyTeera" --
  const stacyUser = await pool.query(
    `SELECT id, username FROM users WHERE LOWER(username) = 'stacyteera' AND is_active = true`
  );
  const stacyEmp = await pool.query(
    `SELECT id, first_name, last_name FROM employees WHERE id = 'bfcd0194-130d-4849-aa1f-b7cd7d361ed2'`
  );

  if (stacyUser.rows.length === 1 && stacyEmp.rows.length === 1) {
    await pool.query('UPDATE employees SET user_id = NULL WHERE user_id = $1 AND id != $2',
      [stacyUser.rows[0].id, stacyEmp.rows[0].id]);
    await pool.query('UPDATE employees SET user_id = $1 WHERE id = $2',
      [stacyUser.rows[0].id, stacyEmp.rows[0].id]);
    console.log(`  [FIXED] Linked employee "${stacyEmp.rows[0].first_name} ${stacyEmp.rows[0].last_name}" -> user "${stacyUser.rows[0].username}"`);
  } else {
    console.log(`  [SKIP] StacyTeera: user found=${stacyUser.rows.length}, employee found=${stacyEmp.rows.length}`);
  }

  // -- 3. Create employee records for orphan users --
  const orphans = [
    { id: 'd53e9b55-82e2-489a-8b07-d1904d0cdda8', username: 'Anitha' },
    { id: 'ab4ff842-6358-4c1c-aec0-b8e76fc7b36e', username: 'Khalid' },
    { id: '3e997dbb-dfa2-4f8e-afda-5a8533c2d91b', username: 'MohamedD' },
  ];

  for (const o of orphans) {
    // Get user's franchise_id
    const u = await pool.query('SELECT id, username, franchise_id FROM users WHERE id = $1', [o.id]);
    if (u.rows.length === 0) {
      console.log(`  [SKIP] User ${o.username} (${o.id}) not found`);
      continue;
    }
    const user = u.rows[0];
    // Check if employee record already exists
    const ex = await pool.query('SELECT id FROM employees WHERE user_id = $1', [user.id]);
    if (ex.rows.length > 0) {
      console.log(`  [SKIP] ${user.username} already has employee record (id=${ex.rows[0].id})`);
      continue;
    }
    await pool.query(
      `INSERT INTO employees (first_name, last_name, user_id, franchise_id)
       VALUES ($1, $2, $3, $4)`,
      [user.username, 'N/A', user.id, user.franchise_id || null]
    );
    console.log(`  [FIXED] Created employee record for user "${user.username}"`);
  }

  console.log(`\n${line}`);
  console.log('  VERIFICATION (re-run audit to confirm)');
  console.log(line);

  // Quick re-check
  const stillUnlinked = await pool.query(`
    SELECT COUNT(*) FROM employees
    WHERE terminated_at IS NULL
      AND (user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = employees.user_id))
  `);
  const stillOrphan = await pool.query(`
    SELECT COUNT(*) FROM users
    WHERE is_active = true AND role != 'Admin'
      AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = users.id)
  `);

  console.log(`  Unlinked employees remaining: ${stillUnlinked.rows[0].count}`);
  console.log(`  Orphan users remaining:      ${stillOrphan.rows[0].count}`);
  console.log(line + '\n');

  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });