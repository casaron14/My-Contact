/* ── Auth guard ──────────────────────────────────────────────────────────── */
const token = sessionStorage.getItem('adminToken');
if (!token) { window.location.replace('/admin/login.html'); }

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const INTENT_LABELS = {
  safe_start: 'Start Investing Safely',
  education:  'Crypto Education',
  strategy:   'Better Strategy',
};

function intentLabel(key) {
  return INTENT_LABELS[key] || key || '—';
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('confirm')) return `<span class="badge badge-green">${status}</span>`;
  if (s.includes('cancel'))  return `<span class="badge badge-red">${status}</span>`;
  if (s.includes('pending')) return `<span class="badge badge-amber">${status}</span>`;
  return `<span class="badge badge-blue">${status || '—'}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtSlot(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

async function apiFetch(path) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('adminToken');
    window.location.replace('/admin/login.html');
    throw new Error('Session expired');
  }
  return res.json();
}

/* ── Sidebar navigation ─────────────────────────────────────────────────────── */
const navItems     = document.querySelectorAll('.nav-item');
const sections     = document.querySelectorAll('.section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    const target = document.getElementById(`section-${item.dataset.section}`);
    if (target) target.classList.add('active');
    // On mobile close sidebar
    document.getElementById('sidebar').classList.remove('open');
  });
});

$('sidebarToggle').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
});

$('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('adminToken');
  window.location.replace('/admin/login.html');
});

/* ── Stats / Overview ───────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    const { ok, stats, error } = await apiFetch('/api/admin/stats');
    if (!ok) throw new Error(error || 'Failed to load stats');

    /* ─ Stat cards ─ */
    $('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Bookings</div>
        <div class="stat-value">${stats.bookings.total}</div>
        <div class="stat-sub">All time</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Month</div>
        <div class="stat-value">${stats.bookings.thisMonth}</div>
        <div class="stat-sub">${new Date().toLocaleString('en-US', {month:'long'})}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Week</div>
        <div class="stat-value">${stats.bookings.thisWeek}</div>
        <div class="stat-sub">Mon – today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Available Slots</div>
        <div class="stat-value">${stats.slots.nextWeekAvailable}</div>
        <div class="stat-sub">${stats.slots.nextWeekBooked} booked · next 7 days</div>
      </div>
    `;

    /* ─ Intent chart ─ */
    const intentEntries = Object.entries(stats.byIntent);
    const maxCount = Math.max(...intentEntries.map(([, c]) => c), 1);
    if (intentEntries.length === 0) {
      $('intentChart').innerHTML = '<div class="empty-state"><p>No bookings yet</p></div>';
    } else {
      $('intentChart').innerHTML = intentEntries
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `
          <div class="intent-row">
            <div class="intent-meta">
              <strong>${label}</strong>
              <span>${count} booking${count !== 1 ? 's' : ''}</span>
            </div>
            <div class="intent-bar-bg">
              <div class="intent-bar-fill" style="width:${Math.round(count / maxCount * 100)}%"></div>
            </div>
          </div>
        `).join('');
    }

    /* ─ Upcoming booked slots ─ */
    const upcoming = stats.slots.upcomingBooked || [];
    if (upcoming.length === 0) {
      $('upcomingSlots').innerHTML = '<div class="empty-state"><p>No booked slots in the next 7 days</p></div>';
    } else {
      $('upcomingSlots').innerHTML = upcoming
        .slice(0, 8)
        .map(iso => {
          const d = new Date(iso);
          return `
            <div class="upcoming-slot">
              <div class="upcoming-slot-dot"></div>
              <div>
                <div class="upcoming-slot-time">${d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}</div>
                <div class="upcoming-slot-date">${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
              </div>
            </div>
          `;
        }).join('');
    }

    /* ─ Today's bookings (full detail table) ─ */
    const todayList = stats.todayBookings || [];
    $('todayCount').textContent = todayList.length;
    renderBookingTable($('todayBookings'), todayList, false);

    /* ─ Recent bookings mini-table ─ */
    renderBookingTable($('recentBookings'), stats.recent, true);

  } catch (err) {
    $('statsGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>⚠ ${err.message}</p></div>`;
  }
}

/* ── Bookings Table ─────────────────────────────────────────────────────────── */
let allBookings = [];

async function loadBookings() {
  try {
    const { ok, bookings, error } = await apiFetch('/api/admin/bookings');
    if (!ok) throw new Error(error || 'Failed to load bookings');

    allBookings = bookings;
    $('bookingsCount').textContent = bookings.length;
    renderBookingTable($('bookingsTableWrap'), bookings, false);
  } catch (err) {
    $('bookingsTableWrap').innerHTML = `<div class="empty-state"><p>⚠ ${err.message}</p></div>`;
  }
}

function renderBookingTable(container, bookings, mini) {
  if (!bookings || bookings.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No bookings found</p></div>';
    return;
  }

  const rows = bookings.map(b => `
    <tr>
      <td><code style="font-size:11px;color:var(--text-muted)">${b.id || '—'}</code></td>
      <td><strong>${b.name || '—'}</strong></td>
      ${!mini ? `<td>${b.email || '—'}</td><td class="td-muted">${b.phone || '—'}</td>` : ''}
      <td>${intentLabel(b.intent)}</td>
      <td>${statusBadge(b.status)}</td>
      <td class="td-muted">${fmtSlot(b.slotDateTime)}</td>
      ${!mini ? `<td class="td-muted">${fmtDate(b.submittedAt)}</td>` : ''}
    </tr>
  `).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Booking ID</th>
          <th>Name</th>
          ${!mini ? '<th>Email</th><th>Phone</th>' : ''}
          <th>Goal</th>
          <th>Status</th>
          <th>Slot</th>
          ${!mini ? '<th>Submitted</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ── Filter handling ────────────────────────────────────────────────────────── */
function applyFilters() {
  const q      = $('searchInput').value.toLowerCase().trim();
  const intent = $('intentFilter').value.toLowerCase();
  const status = $('statusFilter').value.toLowerCase();

  const filtered = allBookings.filter(b => {
    if (q && ![b.name, b.email, b.phone, b.id].join(' ').toLowerCase().includes(q)) return false;
    if (intent && (b.intent || '').toLowerCase() !== intent) return false;
    if (status && (b.status || '').toLowerCase() !== status) return false;
    return true;
  });

  $('bookingsCount').textContent = filtered.length;
  renderBookingTable($('bookingsTableWrap'), filtered, false);
}

$('searchInput').addEventListener('input', applyFilters);
$('intentFilter').addEventListener('change', applyFilters);
$('statusFilter').addEventListener('change', applyFilters);

/* ── Refresh ────────────────────────────────────────────────────────────────── */
$('refreshBtn').addEventListener('click', () => {
  $('statsGrid').innerHTML = '<div class="stat-card skeleton"></div>'.repeat(4);
  loadStats();
});

/* ── Bootstrap ──────────────────────────────────────────────────────────────── */
(async function init() {
  await Promise.all([loadStats(), loadBookings()]);
})();
