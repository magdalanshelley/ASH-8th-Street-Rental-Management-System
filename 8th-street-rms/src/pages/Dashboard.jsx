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
  FaRegClock
} from 'react-icons/fa'
import { motion } from 'framer-motion'
import { RMS_REFRESH_EVENT } from '../utils/rmsEvents'
import { ensureDefaultUnits, formatCurrency } from '../utils/rentalUnits'
import { summarizeTenantMonth } from '../utils/rmsBusiness'
import './Dashboard.css'

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

function OccupancyBar({ label, occupied, total, color }) {
  const pct = total ? Math.round((occupied / total) * 100) : 0
  return (
    <div className="occ-bar-row">
      <div className="occ-bar-header">
        <span className="occ-bar-label">{label}</span>
        <span className="occ-bar-count">{occupied}/{total} <span className="occ-bar-pct">{pct}%</span></span>
      </div>
      <div className="occ-bar-track">
        <div className="occ-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [rooms, setRooms] = useState([])
  const [tenants, setTenants] = useState([])
  const [monthlyPayments, setMonthlyPayments] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [pendingReservations, setPendingReservations] = useState([])
  const [inquiries, setInquiries] = useState([])

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  async function load() {
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const [
        roomsData,
        { data: tenantsData },
        { data: paymentsData },
        { data: recentPay },
        { data: reservationsData },
        { data: inquiriesData }
      ] = await Promise.all([
        ensureDefaultUnits(supabase),
        supabase.from('tenants').select('*'),
        supabase.from('payments').select('*').gte('payment_date', monthStart).lte('payment_date', monthEnd),
        supabase.from('payments').select('*, tenants(full_name)').order('payment_date', { ascending: false }).limit(6),
        supabase.from('reservations').select('*, rooms(room_number)').eq('status', 'Pending').order('reservation_date', { ascending: false }).limit(5),
        supabase.from('inquiries').select('*').eq('status', 'New').order('created_at', { ascending: false }).limit(5)
      ])

      setRooms(roomsData || [])
      setTenants(tenantsData || [])
      setMonthlyPayments(paymentsData || [])
      setRecentPayments(recentPay || [])
      setPendingReservations(reservationsData || [])
      setInquiries(inquiriesData || [])
    } catch (err) {
      console.error('Dashboard load error:', err)
    }
  }

  useEffect(() => {
    load()
    const onRefresh = () => load()
    window.addEventListener(RMS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, onRefresh)
  }, [])

  const totalUnits = rooms.length
  const available = rooms.filter((room) => room.status === 'Available').length
  const occupied = rooms.filter((room) => room.status === 'Occupied').length
  const reserved = rooms.filter((room) => room.status === 'Reserved').length
  const activeTenants = tenants.filter((tenant) => tenant.status === 'Active' || tenant.is_active)
  const monthlyIncome = monthlyPayments.reduce((sum, payment) => sum + Number(payment.amount_paid || payment.amount || 0), 0)
  const outstanding = activeTenants.reduce(
    (sum, tenant) => sum + summarizeTenantMonth(tenant, monthlyPayments, rooms).outstandingBalance,
    0
  )
  const potentialMonthly = rooms.reduce((sum, room) => sum + Number(room.monthly_rent || 0), 0)
  const occupancyRate = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0
  const boardingRooms = rooms.filter((room) => (room.room_number || '').startsWith('Room'))
  const rentalSpaces = rooms.filter((room) => (room.room_number || '').startsWith('RS'))
  const boardingOcc = boardingRooms.filter((room) => room.status === 'Occupied').length
  const rentalOcc = rentalSpaces.filter((room) => room.status === 'Occupied').length

  const cards = [
    { title: 'Total Units', value: totalUnits, icon: FaDoorOpen, accent: 'var(--primary)', sub: 'Master inventory' },
    { title: 'Available Units', value: available, icon: FaHome, accent: 'var(--info)', sub: 'Ready to reserve' },
    { title: 'Reserved Units', value: reserved, icon: FaCalendarAlt, accent: 'var(--warning)', sub: 'Awaiting move-in' },
    { title: 'Occupied Units', value: occupied, icon: FaUserCheck, accent: 'var(--danger)', sub: `${occupancyRate}% occupied` },
    { title: 'Active Tenants', value: activeTenants.length, icon: FaUsers, accent: 'var(--success)', sub: 'Current occupants' },
    { title: 'Income This Month', value: formatCurrency(monthlyIncome), icon: FaMoneyBillWave, accent: '#a78bfa', sub: `of ${formatCurrency(potentialMonthly)} potential` },
    { title: 'Outstanding Balances', value: formatCurrency(outstanding), icon: FaExclamationCircle, accent: 'var(--danger)', sub: outstanding > 0 ? 'Needs follow-up' : 'All clear' },
    { title: 'Occupancy Rate', value: `${occupancyRate}%`, icon: FaPercentage, accent: 'var(--success)', sub: `${occupied} of ${totalUnits} units` }
  ]

  return (
    <motion.div className="dashboard-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
      <header className="dash-header">
        <div>
          <h2>Dashboard</h2>
          <p className="sub">8th Street Rental Management - live operations</p>
        </div>
        <div className="dash-header-date">
          <div>{dateLabel}</div>
          <div className="dash-live-badge"><span className="live-dot" />Live</div>
        </div>
      </header>

      <section className="cards-grid cards-grid--4">
        {cards.map((card, index) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.045 }}>
            <DashboardCard {...card} />
          </motion.div>
        ))}
      </section>

      <section className="lower-grid lower-grid--3">
        <div className="white-card">
          <h3>Recent Payments</h3>
          <div className="activity-list">
            {recentPayments.length === 0
              ? <div className="activity-empty">No payments recorded yet</div>
              : recentPayments.map((payment) => {
                  const amount = Number(payment.amount_paid || payment.amount || 0)
                  const date = payment.payment_date
                    ? new Date(payment.payment_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'No Date'

                  return (
                    <div className="activity-item" key={payment.id}>
                      <div className="activity-dot" style={{ background: 'var(--success)' }} />
                      <div className="activity-body">
                        <span className="activity-name">{payment.tenants?.full_name || `Tenant #${payment.tenant_id}`}</span>
                        <span className="activity-meta">Payment recorded - {date}</span>
                      </div>
                      <span className="activity-amount">+{formatCurrency(amount)}</span>
                    </div>
                  )
                })}
          </div>
        </div>

        <div className="white-card">
          <h3>Property Overview</h3>
          <div className="property-overview">
            <div className="prop-stat-row">
              <span className="prop-stat-label">Boarding Rooms</span>
              <span className="prop-stat-value">{boardingRooms.length}</span>
            </div>
            <div className="prop-stat-row">
              <span className="prop-stat-label">Rental Spaces</span>
              <span className="prop-stat-value">{rentalSpaces.length}</span>
            </div>
            <div className="prop-stat-row">
              <span className="prop-stat-label">Potential Monthly</span>
              <span className="prop-stat-value">{formatCurrency(potentialMonthly)}</span>
            </div>
            <div className="prop-stat-divider" />
            <OccupancyBar label="Boarding Rooms" occupied={boardingOcc} total={boardingRooms.length} color="var(--primary)" />
            <OccupancyBar label="Rental Spaces" occupied={rentalOcc} total={rentalSpaces.length} color="var(--info)" />
          </div>
        </div>

        <div className="white-card">
          <h3>Pending Reservations</h3>
          <div className="activity-list">
            {pendingReservations.length === 0
              ? <div className="activity-empty">No pending reservations</div>
              : pendingReservations.map((reservation) => (
                  <div className="activity-item" key={reservation.id}>
                    <FaRegClock className="activity-icon-sm" style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    <div className="activity-body">
                      <span className="activity-name">{reservation.applicant_name || reservation.guest_name || reservation.tenant_name || 'Unknown'}</span>
                      <span className="activity-meta">{reservation.rooms?.room_number || 'Unit TBD'} - {reservation.reservation_date || ''}</span>
                    </div>
                    <span className="status-badge status-pending">Pending</span>
                  </div>
                ))}
          </div>

          <div className="section-spacer" />
          <h3>New Inquiries</h3>
          <div className="activity-list">
            {inquiries.length === 0
              ? <div className="activity-empty">No new inquiries</div>
              : inquiries.map((inquiry) => (
                  <div className="activity-item" key={inquiry.id}>
                    <FaBell className="activity-icon-sm" style={{ color: 'var(--info)', flexShrink: 0 }} />
                    <div className="activity-body">
                      <span className="activity-name">{inquiry.name || inquiry.contact_name || 'Anonymous'}</span>
                      <span className="activity-meta">{inquiry.message?.slice(0, 42) || 'No message'}</span>
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
