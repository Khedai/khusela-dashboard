const pool = require('./config/db');

async function audit() {
  const line = '='.repeat(70);
  console.log(line);
  console.log('  KHUSELA - DUPLICATE USER & ACCOUNT LINK AUDIT');
  console.log(line + '\n');

  // 1. DUPLICATE EMPLOYEES BY NAME (active only)
  console.log('> DUPLICATE EMPLOYEES BY NAME (first + last, active only)');
  console.log('-'.repeat(70));

  const dupNames = await pool.query(`
    SELECT LOWER(e.first_name) AS fname, LOWER(e.last_name) AS lname,
           COUNT(*) AS occurrences,
           ARRAY_AGG(e.id ORDER BY e.id) AS employee_ids,
           ARRAY_AGG(u.username ORDER BY e.id) AS usernames,
           ARRAY_AGG(u.role ORDER BY e.id) AS roles,
           ARRAY_AGG(e.user_id ORDER BY e.id) AS user_ids
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.terminated_at IS NULL
      AND e.first_name IS NOT NULL
      AND e.first_name != ''
      AND e.last_name IS NOT NULL
      AND e.last_name != ''
    GROUP BY LOWER(e.first_name), LOWER(e.last_name)
    HAVING COUNT(*) > 1
    ORDER BY LOWER(e.last_name), LOWER(e.first_name)
  `);

  if (dupNames.rows.length === 0) {
    console.log('  [OK] No duplicate employee names found.\n');
  } else {
    for (const row of dupNames.rows) {
      console.log(`  [DUP] NAME: "${row.fname} ${row.lname}" - ${row.occurrences} occurrences`);
      for (let i = 0; i < row.employee_ids.length; i++) {
        const uid = row.user_ids[i];
        const uname = row.usernames[i] || '(no linked account)';
        const role = row.roles[i] || '-';
        console.log(`      -> employee_id=${row.employee_ids[i]}  user=${uname}  role=${role}  user_id=${uid || 'NULL'}`);
      }
    }
    console.log(`\n  TOTAL duplicate name groups: ${dupNames.rows.length}\n`);
  }

  // 2. DUPLICATE USERNAMES (case-insensitive)
  console.log('> DUPLICATE USERNAMES (case-insensitive)');
  console.log('-'.repeat(70));

  const dupUsers = await pool.query(`
    SELECT LOWER(username) AS uname, COUNT(*) AS cnt,
           ARRAY_AGG(id ORDER BY id) AS ids,
           ARRAY_AGG(username ORDER BY id) AS original_usernames,
           ARRAY_AGG(role ORDER BY id) AS roles,
           ARRAY_AGG(is_active ORDER BY id) AS active_flags
    FROM users
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
    ORDER BY LOWER(username)
  `);

  if (dupUsers.rows.length === 0) {
    console.log('  [OK] No duplicate usernames found.\n');
  } else {
    for (const row of dupUsers.rows) {
      console.log(`  [DUP] USERNAME: "${row.uname}" - ${row.cnt} accounts`);
      for (let i = 0; i < row.ids.length; i++) {
        console.log(`      -> user_id=${row.ids[i]}  display="${row.original_usernames[i]}"  role=${row.roles[i]}  active=${row.active_flags[i]}`);
      }
    }
    console.log(`\n  TOTAL duplicate username groups: ${dupUsers.rows.length}\n`);
  }

  // 3. EMPLOYEES WITHOUT LINKED USER ACCOUNTS
  console.log('> ACTIVE EMPLOYEES WITHOUT LINKED USER ACCOUNTS');
  console.log('-'.repeat(70));

  const unlinked = await pool.query(`
    SELECT e.id, e.first_name, e.last_name, e.job_title, e.email,
           f.franchise_name
    FROM employees e
    LEFT JOIN franchises f ON e.franchise_id = f.id
    WHERE e.terminated_at IS NULL
      AND (e.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = e.user_id
      ))
    ORDER BY e.last_name, e.first_name
  `);

  if (unlinked.rows.length === 0) {
    console.log('  [OK] All active employees have valid linked accounts.\n');
  } else {
    for (const e of unlinked.rows) {
      console.log(`  [UNLINKED] employee_id=${e.id}  "${e.first_name} ${e.last_name}"  job=${e.job_title || '-'}  franchise=${e.franchise_name || '-'}  email=${e.email || '-'}`);
    }
    console.log(`\n  TOTAL unlinked active employees: ${unlinked.rows.length}\n`);
  }

  // 4. USERS WITHOUT AN EMPLOYEE RECORD
  console.log('> ACTIVE USERS WITHOUT LINKED EMPLOYEE RECORD');
  console.log('-'.repeat(70));

  const orphanUsers = await pool.query(`
    SELECT u.id, u.username, u.role, u.is_active, u.created_at,
           f.franchise_name
    FROM users u
    LEFT JOIN franchises f ON u.franchise_id = f.id
    WHERE u.is_active = true
      AND u.role != 'Admin'
      AND NOT EXISTS (
        SELECT 1 FROM employees e WHERE e.user_id = u.id
      )
    ORDER BY u.username
  `);

  if (orphanUsers.rows.length === 0) {
    console.log('  [OK] All active non-admin users have an employee record.\n');
  } else {
    for (const u of orphanUsers.rows) {
      console.log(`  [ORPHAN] user_id=${u.id}  username="${u.username}"  role=${u.role}  franchise=${u.franchise_name || '-'}  created=${u.created_at}`);
    }
    console.log(`\n  TOTAL users without employee record: ${orphanUsers.rows.length}\n`);
  }

  // 5. EMPLOYEES WITH STALE/BROKEN user_id
  console.log('> EMPLOYEES WITH BROKEN user_id (points to deleted user)');
  console.log('-'.repeat(70));

  const broken = await pool.query(`
    SELECT e.id, e.first_name, e.last_name, e.user_id AS stale_user_id, e.terminated_at
    FROM employees e
    WHERE e.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id)
    ORDER BY e.last_name, e.first_name
  `);

  if (broken.rows.length === 0) {
    console.log('  [OK] No broken employee-to-user links.\n');
  } else {
    for (const e of broken.rows) {
      const status = e.terminated_at ? 'TERMINATED' : 'ACTIVE';
      console.log(`  [BROKEN] employee_id=${e.id}  "${e.first_name} ${e.last_name}"  stale_user_id=${e.stale_user_id}  status=${status}`);
    }
    console.log(`\n  TOTAL broken links: ${broken.rows.length}\n`);
  }

  // 6. ONE USER LINKED TO MULTIPLE EMPLOYEES
  console.log('> USERS LINKED TO MULTIPLE EMPLOYEES (one-to-many)');
  console.log('-'.repeat(70));

  const multiLink = await pool.query(`
    SELECT u.id AS user_id, u.username, u.role, u.is_active,
           COUNT(e.id) AS employee_count,
           ARRAY_AGG(e.id ORDER BY e.id) AS employee_ids,
           ARRAY_AGG(e.first_name || ' ' || e.last_name ORDER BY e.id) AS employee_names,
           ARRAY_AGG(e.terminated_at IS NULL ORDER BY e.id) AS is_active_emp
    FROM users u
    JOIN employees e ON e.user_id = u.id
    GROUP BY u.id, u.username, u.role, u.is_active
    HAVING COUNT(e.id) > 1
    ORDER BY u.username
  `);

  if (multiLink.rows.length === 0) {
    console.log('  [OK] No users linked to multiple employees.\n');
  } else {
    for (const u of multiLink.rows) {
      console.log(`  [MULTI] user_id=${u.user_id}  username="${u.username}"  role=${u.role}  active=${u.is_active}`);
      for (let i = 0; i < u.employee_ids.length; i++) {
        console.log(`      -> employee_id=${u.employee_ids[i]}  "${u.employee_names[i]}"  active=${u.is_active_emp[i]}`);
      }
    }
    console.log(`\n  TOTAL users with multiple employees: ${multiLink.rows.length}\n`);
  }

  // SUMMARY
  console.log(line);
  console.log('  AUDIT SUMMARY');
  console.log(line);

  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM employees WHERE terminated_at IS NULL) AS active_employees,
      (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users,
      (SELECT COUNT(*) FROM employees WHERE terminated_at IS NULL AND user_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = employees.user_id)) AS linked_employees
  `);
  const s = stats.rows[0];
  console.log(`  Active employees:      ${s.active_employees}`);
  console.log(`  Active users:          ${s.active_users}`);
  console.log(`  Linked employees:      ${s.linked_employees}`);
  console.log(`  Duplicate name groups: ${dupNames.rows.length}`);
  console.log(`  Duplicate usernames:   ${dupUsers.rows.length}`);
  console.log(`  Unlinked employees:    ${unlinked.rows.length}`);
  console.log(`  Users w/o employee:    ${orphanUsers.rows.length}`);
  console.log(`  Broken links:          ${broken.rows.length}`);
  console.log(`  Multi-linked users:    ${multiLink.rows.length}`);
  console.log(line + '\n');

  process.exit(0);
}

audit().catch(e => { console.error(e.message); process.exit(1); });