const pool = require('./config/db');

async function check() {
  const r = await pool.query(
    `SELECT e.last_name, e.first_name, u.username, u.role, u.is_active
     FROM employees e
     LEFT JOIN users u ON e.user_id = u.id
     WHERE e.terminated_at IS NULL
  ORDER BY e.last_name, e.first_name`
  );

  console.log('SURNAME         | FIRST NAME     | USERNAME       | ROLE        | ACTIVE');
  console.log('-'.repeat(85));

  let withAccount = 0;
  let withoutAccount = 0;

  for (const row of r.rows) {
    const name = (row.last_name || '?').padEnd(15);
    const first = (row.first_name || '?').padEnd(15);
    const user = (row.username || 'NO ACCOUNT').padEnd(15);
    const role = (row.role || '-').padEnd(12);
    const active = row.is_active !== false ? 'yes' : 'no';

    console.log(`${name}| ${first}| ${user}| ${role}| ${active}`);

    if (row.username) withAccount++;
    else withoutAccount++;
  }

  console.log(`\nTotal: ${r.rows.length} employees`);
  console.log(`With accounts: ${withAccount}`);
  console.log(`Without accounts: ${withoutAccount}`);

  process.exit(0);
}

check().catch(e => { console.error(e.message); process.exit(1); });