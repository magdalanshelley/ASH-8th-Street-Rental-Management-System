import { useEffect, useMemo, useState } from 'react'
import {
  FaUsers,
  FaFileExcel,
  FaDownload,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaUserCheck,
  FaUserTimes,
  FaBuilding,
  FaStore,
  FaFileAlt,
  FaSpinner
} from 'react-icons/fa'
import { supabase } from '../supabase'
import { ensureDefaultUnits, formatCurrency, getUnitTypeLabel } from '../utils/rentalUnits'
import { getPaymentStatusValue, statusClass } from '../utils/rmsBusiness'
import { exportRMSReport } from '../utils/exportReport'
import { motion } from 'framer-motion'
import './Dashboard.css'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function RevenueChart({ payments }) {
  const now   = new Date()
  const slots = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTHS[d.getMonth()] }
  })
  const grouped = {}
  for (const p of payments) {
    if (!p.payment_date) continue
    const d   = new Date(p.payment_date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    grouped[key] = (grouped[key] || 0) + Number(p.amount_paid || p.amount || 0)
  }
  const values = slots.map(s => grouped[`${s.year}-${s.month}`] || 0)
  const maxVal = Math.max(...values, 1)
  return (
    <div className="rev-chart">
      <div className="rev-chart-bars">
        {slots.map((s, i) => (
          <div className="rev-bar-col" key={s.label + s.year}>
            <div className="rev-bar-amount">{values[i] > 0 ? `${(values[i]/1000).toFixed(0)}k` : ''}</div>
            <div className="rev-bar-track">
              <motion.div className="rev-bar-fill"
                initial={{ height: 0 }}
                animate={{ height: `${(values[i]/maxVal)*100}%` }}
                transition={{ delay: i * 0.07, duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <div className="rev-bar-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportCard({ title, value, icon: Icon, accent, sub }) {
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

export default function Reports() {
  const [rooms, setRooms]         = useState([])
  const [tenants, setTenants]     = useState([])
  const [payments, setPayments]   = useState([])
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  async function load() {
    const [r, { data: t }, { data: p }] = await Promise.all([
      ensureDefaultUnits(supabase),
      supabase.from('tenants').select('*'),
      supabase.from('payments').select('*, tenants(full_name, assigned_room_id)')
    ])
    setRooms(r || [])
    setTenants(t || [])
    setPayments(p || [])
  }

  useEffect(() => { load() }, [])

  const a = useMemo(() => {
    const unitMap    = new Map(rooms.map(u => [String(u.id), u]))
    const tenantById = new Map(tenants.map(t => [String(t.id), t]))
    const isRS = r => r && (r.room_type === 'rental_space' || r.room_type === 'commercial' || (r.room_number||'').startsWith('RS'))
    let boardingRev = 0, rentalRev = 0
    for (const p of payments) {
      const tenant = p.tenants || tenantById.get(String(p.tenant_id))
      const room   = tenant?.assigned_room_id ? unitMap.get(String(tenant.assigned_room_id)) : null
      const amt    = Number(p.amount_paid || p.amount || 0)
      if (isRS(room)) rentalRev += amt; else boardingRev += amt
    }
    const totalRevenue = boardingRev + rentalRev
    const paid    = payments.filter(p => getPaymentStatusValue(p, p.tenants || tenantById.get(String(p.tenant_id)), rooms).toLowerCase() === 'paid').length
    const pending = payments.filter(p => getPaymentStatusValue(p, p.tenants || tenantById.get(String(p.tenant_id)), rooms).toLowerCase() === 'pending').length
    const partial = payments.filter(p => getPaymentStatusValue(p, p.tenants || tenantById.get(String(p.tenant_id)), rooms).toLowerCase() === 'partial').length
    const active  = tenants.filter(t => t.status === 'Active' || t.is_active).length
    const former  = tenants.length - active
    const available = rooms.filter(unit => unit.status === 'Available').length
    const reserved = rooms.filter(unit => unit.status === 'Reserved').length
    const occupied = rooms.filter(unit => unit.status === 'Occupied').length
    return { totalRevenue, boardingRev, rentalRev, paid, pending, partial, active, former, available, reserved, occupied }
  }, [rooms, tenants, payments])

  async function handleExport() {
    setExporting(true)
    setExportMsg('Building your report…')
    try {
      await exportRMSReport({ rooms, tenants, payments })
      setExportMsg('Downloaded successfully!')
    } catch (err) {
      console.error(err)
      setExportMsg('Export failed — check console.')
    } finally {
      setExporting(false)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }

  const payCards = [
    { title: 'Total Payments',   value: payments.length, icon: FaFileAlt,            accent: 'var(--primary)', sub: 'All recorded' },
    { title: 'Paid',             value: a.paid,          icon: FaCheckCircle,         accent: 'var(--success)', sub: 'Completed' },
    { title: 'Pending',          value: a.pending,       icon: FaClock,               accent: 'var(--warning)', sub: 'Awaiting payment' },
    { title: 'Partial',          value: a.partial,       icon: FaExclamationTriangle, accent: 'var(--danger)',  sub: 'Incomplete' },
  ]
  const tenantCards = [
    { title: 'Total Tenants',  value: tenants.length, icon: FaUsers,     accent: 'var(--primary)', sub: 'Ever registered' },
    { title: 'Active Tenants', value: a.active,       icon: FaUserCheck, accent: 'var(--success)', sub: 'Currently renting' },
    { title: 'Former Tenants', value: a.former,       icon: FaUserTimes, accent: 'var(--info)',    sub: 'Past tenants' },
  ]
  const inventoryCards = [
    { title: 'Available Units', value: a.available, icon: FaBuilding, accent: 'var(--info)', sub: 'Ready to reserve' },
    { title: 'Reserved Units', value: a.reserved, icon: FaClock, accent: 'var(--warning)', sub: 'Reservation hold' },
    { title: 'Occupied Units', value: a.occupied, icon: FaUserCheck, accent: 'var(--danger)', sub: 'Active tenant assigned' },
  ]

  return (
    <motion.div className="dashboard-page"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="dash-header">
        <div>
          <h2>Reports</h2>
          <p className="sub">Business analytics for 8th Street rental units</p>
        </div>
      </header>

      <div className="report-section-label">Payment Analytics</div>
      <section className="cards-grid cards-grid--4">
        {payCards.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <ReportCard {...c} />
          </motion.div>
        ))}
      </section>

      <div className="report-section-label">Tenant Analytics</div>
      <section className="cards-grid cards-grid--3">
        {tenantCards.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <ReportCard {...c} />
          </motion.div>
        ))}
      </section>

      <div className="report-section-label">Inventory Analytics</div>
      <section className="cards-grid cards-grid--3">
        {inventoryCards.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <ReportCard {...c} />
          </motion.div>
        ))}
      </section>

      <section className="lower-grid lower-grid--2">
        <div className="white-card">
          <h3>Monthly Revenue Trend</h3>
          <RevenueChart payments={payments} />
        </div>
        <div className="white-card">
          <h3>Revenue Breakdown</h3>
          <div className="rev-breakdown">
            {[
              { label: 'Boarding Rooms', rev: a.boardingRev, icon: FaBuilding, color: 'var(--primary)' },
              { label: 'Rental Spaces',  rev: a.rentalRev,   icon: FaStore,    color: 'var(--info)' },
            ].map(({ label, rev, icon: Icon, color }) => (
              <div className="rev-break-item" key={label}>
                <div className="rev-break-top">
                  <span className="rev-break-icon" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                    <Icon />
                  </span>
                  <span className="rev-break-label">{label}</span>
                </div>
                <div className="rev-break-value">{formatCurrency(rev)}</div>
                <div className="rev-break-bar">
                  <div className="rev-break-fill" style={{
                    width: a.totalRevenue ? `${Math.round((rev/a.totalRevenue)*100)}%` : '0%',
                    background: color
                  }} />
                </div>
                <div className="rev-break-pct">
                  {a.totalRevenue ? Math.round((rev/a.totalRevenue)*100) : 0}% of total
                </div>
              </div>
            ))}
            <div className="rev-total-row">
              <span>Total Revenue</span>
              <strong>{formatCurrency(a.totalRevenue)}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="white-card report-wide">
        <h3>Unit Inventory</h3>
        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr><th>Unit</th><th>Type</th><th>Monthly Rent</th><th>Status</th><th>Current Tenant</th></tr>
            </thead>
            <tbody>
              {rooms.map(unit => {
                const tenant = tenants.find(t => String(t.assigned_room_id) === String(unit.id) && (t.status === 'Active' || t.is_active))
                return (
                  <tr key={unit.id}>
                    <td><strong>{unit.room_number}</strong></td>
                    <td>{getUnitTypeLabel(unit.room_type)}</td>
                    <td>{formatCurrency(unit.monthly_rent)}</td>
                    <td><span className={`status-badge status-${statusClass(unit.status)}`}>{unit.status||'Available'}</span></td>
                    <td>{tenant?.full_name || <span style={{ opacity: 0.4 }}>—</span>}</td>
                  </tr>
                )
              })}
              {rooms.length === 0 && <tr><td className="empty-state" colSpan="5">No rental units found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Export Center ── */}
      <div className="white-card report-wide export-center">
        <h3>Export Report</h3>
        <p className="export-desc">
          Downloads a complete, professionally styled Excel workbook with 5 tabs — all populated from your live data.
        </p>

        <div className="export-hero">
          <button
            className={`export-hero-btn${exporting ? ' export-hero-btn--loading' : ''}`}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <FaSpinner className="spin" /> : <FaFileExcel />}
            <span>{exporting ? 'Generating report…' : 'Download Full Excel Report (.xlsx)'}</span>
            {!exporting && <FaDownload className="export-btn-arrow" />}
          </button>
          {exportMsg && (
            <motion.div className="export-toast"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {exportMsg}
            </motion.div>
          )}
        </div>

        <div className="export-sheets-preview">
          {[
            { sheet: 'Summary',         desc: 'KPI overview — occupancy, financials, tenants' },
            { sheet: 'Unit Inventory',  desc: 'All 8 units with rent, status & current tenant' },
            { sheet: 'Tenant List',     desc: 'Contact info, move-in dates, balance due' },
            { sheet: 'Payment History', desc: 'Every payment sorted newest-first with status' },
            { sheet: 'Monthly Revenue', desc: 'Month-by-month boarding vs rental space totals' },
          ].map(({ sheet, desc }) => (
            <div className="export-sheet-chip" key={sheet}>
              <span className="export-sheet-icon">📄</span>
              <div>
                <div className="export-sheet-name">{sheet}</div>
                <div className="export-sheet-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
