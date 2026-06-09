import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  FaHome,
  FaDoorOpen,
  FaUsers,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaUserCheck,
  FaExclamationCircle,
  FaPercentage,
  FaBell,
  FaCheckCircle,
  FaRegClock
} from 'react-icons/fa'
import { RMS_REFRESH_EVENT } from '../utils/rmsEvents'
import { motion, AnimatePresence } from 'framer-motion'
import './Dashboard.css'

/* ── Property constants ── */
const BOARDING_ROOMS = [
  { number: 'Room 1', rent: 4000 },
  { number: 'Room 2', rent: 8000 },
  { number: 'Room 3', rent: 8000 },
  { number: 'Room 4', rent: 8000 }
]
const RENTAL_SPACES = [
  { number: 'RS-1', rent: 8000 },
  { number: 'RS-2', rent: 8000 },
  { number: 'RS-3', rent: 8000 },
  { number: 'RS-4', rent: 8000 }
]
const POTENTIAL_MONTHLY = BOARDING_ROOMS.reduce((s, r) => s + r.rent, 0)
  + RENTAL_SPACES.reduce((s, r) => s + r.rent, 0)

/* ── Stat Card ── */
function DashboardCard({ title, value, icon: Icon, accent, sub }) {
  return (
    <div className="dash-card" style={{ '--card-accent': accent }}>
      <div className="card-icon"><Icon /></div>
      <div className="card-info">
        <span className="card-value">{value}</span>
        <span className="card-title">{title}</span>
        {sub && <span className="card-sub">{sub}</span>}
      </div>
    </div>
  )
}

/* ── Occupancy Bar ── */
function OccupancyBar({ label, occupied, total, color }) {
  const pct = total ? Math.round((occupied / total) * 100) : 0
  return (
    <div className="occ-bar-row">
      <div className="occ-bar-header">
        <span className="occ-bar-label">{label}</span>
        <span className="occ-bar-count">{occupied}/{total} &nbsp;<span className="occ-bar-pct">{pct}%</span></span>
      </div>
      <div className="occ-bar-track">
        <div className="occ-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [rooms, setRooms]                 = useState([])
  const [tenants, setTenants]             = useState([])
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [outstanding, setOutstanding]     = useState(0)
  const [recentPayments, setRecentPayments] = useState([])
  const [pendingReservations, setPendingReservations] = useState([])
  const [inquiries, setInquiries]         = useState([])

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    load()
    const onRefresh = () => load()
    window.addEventListener(RMS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, onRefresh)
  }, [])

  async function load() {
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const [
        { data: roomsData },
        { data: tenantsData },
        { data: paymentsData },
        { data: recentPay },
        { data: reservationsData },
        { data: inquiriesData }
      ] = await Promise.all([
        supabase.from('rooms').select('*'),
        supabase.from('tenants').select('*'),
        supabase.from('payments').select('*').gte('payment_date', monthStart).lte('payment_date', monthEnd),
        supabase.from('payments').select('*, tenants(full_name)').order('payment_date', { ascending: false }).limit(6),
        supabase.from('reservations').select('*, rooms(room_number)').eq('status', 'Pending').order('created_at', { ascending: false }).limit(5),
        supabase.from('inquiries').select('*').eq('status', 'New').order('created_at', { ascending: false }).limit(5)
      ])

      setRooms(roomsData || [])
      setTenants(tenantsData || [])

      const income = (paymentsData || []).reduce(
        (s, p) => s + Number(p.amount_paid || p.amount || 0), 0
      )
      setMonthlyIncome(income)

      const bal = (tenantsData || []).reduce(
        (s, t) => s + Number(t.balance_due || t.outstanding_balance || 0), 0
      )
      setOutstanding(bal)

      setRecentPayments(recentPay || [])
      setPendingReservations(reservationsData || [])
      setInquiries(inquiriesData || [])
    } catch (err) {
      console.error('Dashboard load error:', err)
    }
  }

  /* Derived */
  const totalUnits    = rooms.length
  const available     = rooms.filter(r => r.status === 'Available').length
  const occupied      = rooms.filter(r => r.status === 'Occupied').length
  const reserved      = rooms.filter(r => r.status === 'Reserved').length
  const occupancyRate = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0

  const boardingRooms  = rooms.filter(r => r.room_type === 'boarding' || r.room_type === 'single' || (r.room_number || '').startsWith('Room'))
  const rentalSpaces   = rooms.filter(r => r.room_type === 'rental_space' || r.room_type === 'commercial' || (r.room_number || '').startsWith('RS'))
  const boardingOcc    = boardingRooms.filter(r => r.status === 'Occupied').length
  const rentalOcc      = rentalSpaces.filter(r => r.status === 'Occupied').length

  const cards = [
    { title: 'Total Rental Units', value: totalUnits,   icon: FaDoorOpen,         accent: 'var(--primary)',  sub: '4 rooms · 4 spaces' },
    { title: 'Available Units',    value: available,     icon: FaHome,             accent: 'var(--info)',     sub: 'Ready to lease' },
    { title: 'Occupied Units',     value: occupied,      icon: FaUserCheck,        accent: 'var(--danger)',   sub: `${occupancyRate}% occupied` },
    { title: 'Reserved Units',     value: reserved,      icon: FaCalendarAlt,      accent: 'var(--warning)',  sub: 'Pending move-in' },
    { title: 'Total Tenants',      value: tenants.length, icon: FaUsers,           accent: 'var(--success)',  sub: 'Active & reserved' },
    { title: 'Income This Month',  value: `PHP ${monthlyIncome.toLocaleString()}`, icon: FaMoneyBillWave, accent: '#a78bfa', sub: `of PHP ${POTENTIAL_MONTHLY.toLocaleString()} potential` },
    { title: 'Outstanding Balance', value: `PHP ${outstanding.toLocaleString()}`,  icon: FaExclamationCircle, accent: 'var(--danger)', sub: outstanding > 0 ? 'Needs follow-up' : 'All clear' },
    { title: 'Occupancy Rate',     value: `${occupancyRate}%`,  icon: FaPercentage, accent: 'var(--success)', sub: `${occupied} of ${totalUnits} units` }
  ]

  return (
    <motion.div
      className="dashboard-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* ── Header ── */}
      <header className="dash-header">
        <div>
          <h2>Dashboard</h2>
          <p className="sub">8th Street Rental Management — real-time operations</p>
        </div>
        <div className="dash-header-date">
          <div>{dateLabel}</div>
          <div className="dash-live-badge"><span className="live-dot" />Live</div>
        </div>
      </header>

      {/* ── Stat Cards ── */}
      <section className="cards-grid cards-grid--4">
        {cards.map((card, i) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.045 }}>
            <DashboardCard {...card} />
          </motion.div>
        ))}
      </section>

      {/* ── Lower Grid ── */}
      <section className="lower-grid lower-grid--3">

        {/* Recent Payments */}
        <div className="white-card">
          <h3>Recent Payments</h3>
          <div className="activity-list">
            {recentPayments.length === 0
              ? <div className="activity-empty">No payments recorded yet</div>
              : recentPayments.map(p => {
                  const name   = p.tenants?.full_name || `Tenant #${p.tenant_id}`
                  const amount = Number(p.amount_paid || p.amount || 0)
                  const date   = p.payment_date
                    ? new Date(p.payment_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'No Date'
                  return (
                    <div className="activity-item" key={p.id}>
                      <div className="activity-dot" style={{ background: 'var(--success)' }} />
                      <div className="activity-body">
                        <span className="activity-name">{name}</span>
                        <span className="activity-meta">Payment recorded · {date}</span>
                      </div>
                      <span className="activity-amount">+PHP {amount.toLocaleString()}</span>
                    </div>
                  )
                })}
          </div>
        </div>

        {/* Property Overview */}
        <div className="white-card">
          <h3>Property Overview</h3>
          <div className="property-overview">
            <div className="prop-stat-row">
              <span className="prop-stat-label">Boarding Rooms</span>
              <span className="prop-stat-value">4</span>
            </div>
            <div className="prop-stat-row">
              <span className="prop-stat-label">Rental Spaces</span>
              <span className="prop-stat-value">4</span>
            </div>
            <div className="prop-stat-row">
              <span className="prop-stat-label">Potential Monthly</span>
              <span className="prop-stat-value">PHP {POTENTIAL_MONTHLY.toLocaleString()}</span>
            </div>
            <div className="prop-stat-divider" />
            <OccupancyBar label="Boarding Rooms" occupied={boardingOcc} total={boardingRooms.length || 4} color="var(--primary)" />
            <OccupancyBar label="Rental Spaces"  occupied={rentalOcc}   total={rentalSpaces.length || 4}  color="var(--info)" />
          </div>
        </div>

        {/* Pending Reservations + Inquiries */}
        <div className="white-card">
          <h3>Pending Reservations</h3>
          <div className="activity-list">
            {pendingReservations.length === 0
              ? <div className="activity-empty">No pending reservations</div>
              : pendingReservations.map(r => (
                  <div className="activity-item" key={r.id}>
                    <FaRegClock className="activity-icon-sm" style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    <div className="activity-body">
                      <span className="activity-name">{r.guest_name || r.tenant_name || 'Unknown'}</span>
                      <span className="activity-meta">{r.rooms?.room_number || 'Unit TBD'} · {r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</span>
                    </div>
                    <span className="status-badge status-reserved">Pending</span>
                  </div>
                ))}
          </div>

          <div className="section-spacer" />
          <h3>New Inquiries</h3>
          <div className="activity-list">
            {inquiries.length === 0
              ? <div className="activity-empty">No new inquiries</div>
              : inquiries.map(inq => (
                  <div className="activity-item" key={inq.id}>
                    <FaBell className="activity-icon-sm" style={{ color: 'var(--info)', flexShrink: 0 }} />
                    <div className="activity-body">
                      <span className="activity-name">{inq.name || inq.contact_name || 'Anonymous'}</span>
                      <span className="activity-meta">{inq.message?.slice(0, 42) || 'No message'}…</span>
                    </div>
                    <span className="status-badge status-available">New</span>
                  </div>
                ))}
          </div>
        </div>

      </section>
    </motion.div>
  )
}