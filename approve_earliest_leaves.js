#!/usr/bin/env node
// Approve earliest N pending leave requests via API
// Usage: node approve_earliest_leaves.js [count]

const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:5000/api';
const COUNT = parseInt(process.argv[2], 10) || 3;

async function run() {
  try {
    console.log(`Fetching pending leave requests from ${API_BASE}`);
    const res = await axios.get(`${API_BASE}/leave/requests?page=1&limit=200`);
    const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
    const pending = data.filter(r => r.status === 'Pending')
      .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    if (pending.length === 0) { console.log('No pending requests found.'); return; }
    const toApprove = pending.slice(0, COUNT);
    console.log(`Approving ${toApprove.length} request(s):`, toApprove.map(r => r.id));
    for (const r of toApprove) {
      try {
        const patch = await axios.patch(`${API_BASE}/leave/request/${r.id}`, { status: 'Approved' });
        console.log(`Approved request ${r.id}`);
      } catch (err) {
        console.error(`Failed to approve ${r.id}:`, err.response?.data || err.message);
      }
    }
  } catch (err) {
    console.error('Failed to fetch requests:', err.response?.data || err.message);
  }
}

run();
