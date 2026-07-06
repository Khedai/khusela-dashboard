
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
};

const MODULES = [
  'neuro-synaptic', 'quantum-resonance', 'crypto-tunnel',
  'entropy-harvester', 'photon-mesh', 'graviton-lens',
  'dark-matter', 'neutrino-filter', 'plasma-conduit',
  'tachyon-relay', 'singularity-core', 'warp-manifold',
];

const ACTIONS = [
  'initializing', 'calibrating', 'sequencing', 'resonating',
  'decoding', 'routing', 'optimizing', 'synthesizing',
  'compiling', 'transmitting', 'receiving', 'validating',
  'replicating', 'defragmenting', 'harmonizing', 'pulsing',
];

const VERBS = [
  'Processing', 'Loading', 'Fetching', 'Computing', 'Resolving',
  'Establishing', 'Negotiating', 'Scanning', 'Mapping', 'Indexing',
  'Analyzing', 'Aggregating', 'Distilling', 'Weaving', 'Forging',
];

const NOUNS = [
  'data-streams', 'hash-chains', 'merkle-trees', 'zero-knowledge-proofs',
  'elliptic-curves', 'lattice-matrices', 'oracle-nodes', 'consensus-layers',
  'shard-fragments', 'validator-sets', 'attestation-blocks', 'sync-committees',
  'BLS-signatures', 'KZG-commitments', 'Verkle-tries', 'blob-transactions',
  'execution-payloads', 'beacon-states', 'fork-choice', 'gossip-topics',
];

const IP_BLOCKS = () => [
  `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
  `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
];

function hash() {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function latency() {
  return (Math.random() * 800 + 20).toFixed(1);
}

function throughput() {
  return (Math.random() * 9500 + 500).toFixed(0);
}

function memory() {
  return (Math.random() * 14 + 2).toFixed(2);
}

function status() {
  const s = ['OK', 'OK', 'OK', 'OK', 'DEGRADED', 'SYNCING'];
  return s[Math.floor(Math.random() * s.length)];
}

function line() {
  const type = Math.floor(Math.random() * 10);
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 23);
  const dim = COLORS.dim;
  const pad8 = (s) => String(s).padStart(8);

  switch (type) {
    case 0: // Module status
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.cyan}[${MODULES[Math.floor(Math.random() * MODULES.length)]}]${COLORS.reset} ${COLORS.green}${ACTIONS[Math.floor(Math.random() * ACTIONS.length)]}${COLORS.reset} ${dim}...${COLORS.reset} ${COLORS.green}OK${COLORS.reset} (${latency()}ms)`;
    case 1: // Data processing
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.yellow}${VERBS[Math.floor(Math.random() * VERBS.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}${COLORS.reset} ${dim}|${COLORS.reset} block ${COLORS.magenta}#${Math.floor(Math.random() * 9000000) + 1000000}${COLORS.reset} ${dim}|${COLORS.reset} tx/${Math.floor(Math.random() * 30) + 5} ${dim}|${COLORS.reset} ${throughput()} TPS`;
    case 2: // Hash computation
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.magenta}[CRYPTO]${COLORS.reset} computed hash ${COLORS.yellow}0x${hash().substring(0, 16)}...${hash().substring(48)}${COLORS.reset} ${dim}|${COLORS.reset} nonce=${Math.floor(Math.random() * 9999999999)} ${dim}|${COLORS.reset} difficulty=${(Math.random() * 50 + 10).toFixed(2)}T`;
    case 3: // Network peer
      const [ip1, ip2] = IP_BLOCKS();
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.green}[P2P]${COLORS.reset} peer connected: ${COLORS.cyan}${ip1}:${Math.floor(Math.random() * 65535)}${COLORS.reset} ${dim}|${COLORS.reset} latency=${latency()}ms ${dim}|${COLORS.reset} peers=${Math.floor(Math.random() * 5000) + 100}`;
    case 4: // Memory / resource
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.yellow}[RESOURCE]${COLORS.reset} heap=${memory()}GB / ${(Math.random() * 4 + 14).toFixed(2)}GB ${dim}|${COLORS.reset} gc-cycles=${Math.floor(Math.random() * 200)} ${dim}|${COLORS.reset} alloc-rate=${(Math.random() * 500 + 50).toFixed(1)}MB/s ${dim}|${COLORS.reset} status=${COLORS.green}${status()}${COLORS.reset}`;
    case 5: // Consensus message
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.bright}[CONSENSUS]${COLORS.reset} ${COLORS.green}slot=${Math.floor(Math.random() * 9000000) + 1000000}${COLORS.reset} epoch=${Math.floor(Math.random() * 200000)} ${dim}|${COLORS.reset} justified=${COLORS.green}✓${COLORS.reset} finalized=${COLORS.green}✓${COLORS.reset} ${dim}|${COLORS.reset} votes=${Math.floor(Math.random() * 500000) + 100000}`;
    case 6: // Indexing
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.yellow}[INDEXER]${COLORS.reset} indexed ${pad8(Math.floor(Math.random() * 50000))} records ${dim}|${COLORS.reset} batch=${Math.floor(Math.random() * 1000)}/${Math.floor(Math.random() * 2000) + 500} ${dim}|${COLORS.reset} ${(Math.random() * 100).toFixed(1)}% complete ${COLORS.green}▰▰▰▰▰▰▰▰▰${COLORS.dim}▱${COLORS.reset}`;
    case 7: // Validator
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.green}[VALIDATOR ${Math.floor(Math.random() * 900000) + 100000}]${COLORS.reset} proposed block ${COLORS.yellow}#${Math.floor(Math.random() * 9000000) + 1000000}${COLORS.reset} ${dim}|${COLORS.reset} attestations=${Math.floor(Math.random() * 200) + 30} ${dim}|${COLORS.reset} rewards=${(Math.random() * 0.01).toFixed(6)} ETH`;
    case 8: // Database
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.magenta}[DB]${COLORS.reset} query executed ${COLORS.cyan}SELECT ... FROM ... WHERE ...${COLORS.reset} ${dim}|${COLORS.reset} rows=${Math.floor(Math.random() * 100000)} ${dim}|${COLORS.reset} time=${(Math.random() * 50 + 1).toFixed(2)}ms ${dim}|${COLORS.reset} cache=${Math.random() > 0.5 ? `${COLORS.green}HIT${COLORS.reset}` : `${COLORS.red}MISS${COLORS.reset}`}`;
    case 9: // Shard / fragment
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.cyan}[SHARD ${Math.floor(Math.random() * 64)}]${COLORS.reset} ${COLORS.yellow}crosslinking${COLORS.reset} ${dim}|${COLORS.reset} fragments=${Math.floor(Math.random() * 1024)} ${dim}|${COLORS.reset} root=${COLORS.yellow}0x${hash().substring(0, 40)}${COLORS.reset} ${dim}|${COLORS.reset} delay=${latency()}ms`;
    default:
      return `${dim}[${ts}]${COLORS.reset} ${COLORS.yellow}[...]${COLORS.reset}`;
  }
}

const STATS = {
  tps: 0,
  peers: 0,
  memory: 0,
  blocks: 0,
  latency: 0,
  txCount: 0,
  uptime: 0,
};

function updateStats() {
  STATS.tps = Math.floor(Math.random() * 9500 + 500);
  STATS.peers = Math.floor(Math.random() * 5000 + 100);
  STATS.memory = (Math.random() * 14 + 2).toFixed(2);
  STATS.blocks = Math.floor(Math.random() * 9000000 + 1000000);
  STATS.latency = (Math.random() * 800 + 20).toFixed(0);
  STATS.txCount += Math.floor(Math.random() * 1000 + 100);
  STATS.uptime = Math.floor(Date.now() / 1000 - startTime);
}

const startTime = Date.now() / 1000;
let lineBuffer = [];
const maxLines = 25;

function getBar(value, max, width = 10) {
  const filled = Math.ceil((value / max) * width);
  const empty = width - filled;
  return `${COLORS.green}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset}`;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderDashboard() {
  process.stdout.write('\x1b[2J\x1b[H'); // clear screen
  
  console.log(`${COLORS.bright}${COLORS.cyan}╔════════════════════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset}${COLORS.bright}  ⚡ QUANTUM BLOCKCHAIN SIMULATION v5.0 - DISTRIBUTED CONSENSUS ENGINE  ⚡  ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}╠════════════════════════════════════════════════════════════════════════════╣${COLORS.reset}`);
  
  // Stats row 1
  console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset} ${COLORS.yellow}TPS${COLORS.reset} ${getBar(STATS.tps, 10000)} ${COLORS.bright}${String(STATS.tps).padStart(5)}${COLORS.reset}    ${COLORS.magenta}PEERS${COLORS.reset} ${getBar(STATS.peers, 5000)} ${COLORS.bright}${String(STATS.peers).padStart(5)}${COLORS.reset}    ${COLORS.green}UPTIME${COLORS.reset} ${COLORS.bright}${formatTime(STATS.uptime)}${COLORS.reset}   ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  
  // Stats row 2
  console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset} ${COLORS.red}MEM${COLORS.reset} ${getBar(STATS.memory, 16)} ${COLORS.bright}${STATS.memory}GB${COLORS.reset}  ${COLORS.cyan}BLOCKS${COLORS.reset} ${COLORS.bright}#${STATS.blocks}${COLORS.reset}      ${COLORS.yellow}LATENCY${COLORS.reset} ${COLORS.bright}${STATS.latency}ms${COLORS.reset}     ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  
  console.log(`${COLORS.bright}${COLORS.cyan}╠════════════════════════════════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset} ${COLORS.green}TRANSACTIONS PROCESSED${COLORS.reset} ${COLORS.bright}${STATS.txCount.toLocaleString()}${COLORS.reset} ${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}╠════════════════════════════════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset}${COLORS.dim} NODE LOGS ${COLORS.reset}${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}╠════════════════════════════════════════════════════════════════════════════╣${COLORS.reset}`);
  
  // Show last lines
  lineBuffer.slice(-maxLines).forEach(l => {
    console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset} ${l.substring(0, 78)}${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  });
  
  const emptyLines = Math.max(0, maxLines - lineBuffer.length);
  for (let i = 0; i < emptyLines; i++) {
    console.log(`${COLORS.bright}${COLORS.cyan}║${COLORS.reset}${' '.repeat(80)}${COLORS.bright}${COLORS.cyan}║${COLORS.reset}`);
  }
  
  console.log(`${COLORS.bright}${COLORS.cyan}╚════════════════════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`${COLORS.dim}Press Ctrl+C to terminate • ${new Date().toLocaleString()}${COLORS.reset}`);
}

process.stdout.write('\x1b[2J\x1b[H'); // clear screen

// Initial render
renderDashboard();

setInterval(() => {
  updateStats();
  lineBuffer.push(line());
  if (lineBuffer.length > maxLines * 2) {
    lineBuffer = lineBuffer.slice(-maxLines);
  }
  renderDashboard();
}, Math.floor(Math.random() * 120) + 40);