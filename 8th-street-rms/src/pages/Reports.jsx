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
  FaSpinner,
  FaStar,
  FaTools,
  FaFileInvoiceDollar,
  FaSync
} from 'react-icons/fa'
import { supabase } from '../supabase'
import { ensureDefaultUnits, formatCurrency, getUnitTypeLabel } from '../utils/rentalUnits'
import { getPaymentStatusValue, statusClass } from '../utils/rmsBusiness'
import { exportRMSReport } from '../utils/exportReport'
import { motion } from 'framer-motion'
import './Dashboard.css'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Payer rating helper (mirrors TenantAccount) ───────────────────────────────
function getPayerRating(payments, monthlyRent) {
  if (!payments.length) return 'No History'
  const paid = payments.filter((p) => Number(p.amount_paid || 0) >= monthlyRent).length
  const ratio = paid / payments.length
  if (ratio >= 0.9) return 'Good Payer'
  if (ratio >= 0.6) return 'Average Payer'
  return 'Late / Partial'
}

function payerRatingClass(rating) {
  if (rating === 'Good Payer') return 'paid'
  if (rating === 'Average Payer') return 'partial'
  if (rating === 'Late / Partial') return 'pending'
  return 'inactive'
}

function RevenueChart({ payments }) {
  const now = new Date()
  const slots = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTHS[d.getMonth()] }
  })
  const grouped = {}
  for (const p of payments) {
    if (!p.payment_date) continue
    const d = new Date(p.payment_date)
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
  const [rooms, setRooms]               = useState([])
  const [tenants, setTenants]           = useState([])
  const [payments, setPayments]         = useState([])
  const [bills, setBills]               = useState([])
  const [maintenanceLogs, setMaintenance] = useState([])
  const [loading, setLoading]           = useState(true)
  const [exporting, setExporting]       = useState(false)
  const [exportMsg, setExportMsg]       = useState('')

  async function load() {
    setLoading(true)
    try {
      const [roomsData, tenantsRes, paymentsRes, billsRes, maintenanceRes] = await Promise.all([
        ensureDefaultUnits(supabase),
        supabase.from('tenants').select('*'),
        supabase.from('payments').select('*, tenants(full_name, assigned_room_id)'),
        supabase.from('bills').select('*'),
        supabase.from('maintenance_logs').select('*')
      ])

      if (tenantsRes.error)    console.error('Reports: tenants query failed', tenantsRes.error)
      if (paymentsRes.error)   console.error('Reports: payments query failed', paymentsRes.error)
      if (billsRes.error)      console.error('Reports: bills query failed', billsRes.error)
      if (maintenanceRes.error) console.error('Reports: maintenance query failed', maintenanceRes.error)

      setRooms(roomsData || [])
      setTenants(tenantsRes.data || [])
      setPayments(paymentsRes.data || [])
      setBills(billsRes.data || [])
      setMaintenance(maintenanceRes.data || [])
    } catch (err) {
      console.error('Reports: load failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const a = useMemo(() => {
    const unitMap    = new Map(rooms.map(u => [String(u.id), u]))
    const tenantById = new Map(tenants.map(t => [String(t.id), t]))
    const isRS = r => r && (r.room_type === 'rental_space' || r.room_type === 'commercial' || (r.room_number||'').startsWith('RS'))

    let boardingRev = 0, rentalRev = 0
    for (const p of payments) {
      const tenant = p.tenants || tenantById.get(String(p.tenant_id))
      // Always look up the room from the authoritative unitMap using the tenant's assigned_room_id
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
    const reserved  = rooms.filter(unit => unit.status === 'Reserved').length
    const occupied  = rooms.filter(unit => unit.status === 'Occupied').length

    // Bills analytics
    const totalBillsUnpaid = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)
    const overdueBills = bills.filter(b => b.status === 'Overdue').length

    // Maintenance analytics
    const pendingMaintenance   = maintenanceLogs.filter(l => l.status === 'Pending').length
    const inProgressMaintenance = maintenanceLogs.filter(l => l.status === 'In Progress').length
    const totalMaintenanceCost = maintenanceLogs
      .filter(l => l.status !== 'Cancelled')
      .reduce((s, l) => s + Number(l.cost || 0), 0)

    return {
      totalRevenue, boardingRev, rentalRev,
      paid, pending, partial,
      active, former,
      available, reserved, occupied,
      totalBillsUnpaid, overdueBills,
      pendingMaintenance, inProgressMaintenance, totalMaintenanceCost
    }
  }, [rooms, tenants, payments, bills, maintenanceLogs])

  // ── Tenant payment summary with payer rating ──────────────────────────────
  const tenantSummaries = useMemo(() => {
    const unitMap = new Map(rooms.map(u => [String(u.id), u]))
    return tenants
      .filter(t => t.status === 'Active')
      .map(t => {
        const tenantPayments = payments.filter(p => String(p.tenant_id) === String(t.id))
        const room = unitMap.get(String(t.assigned_room_id))
        const monthlyRent = Number(room?.monthly_rent || 0)
        const totalPaid = tenantPayments.reduce((s, p) => s + Number(p.amount_paid || 0), 0)
        const rating = getPayerRating(tenantPayments, monthlyRent)

        const today = new Date()
        const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
        const paidThisMonth = tenantPayments.some(p => p.payment_date?.startsWith(thisMonth))

        const tenantBills = bills.filter(b => String(b.tenant_id) === String(t.id))
        const unpaidBills = tenantBills.filter(b => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)

        return {
          tenant: t,
          room,
          monthlyRent,
          totalPaid,
          rating,
          paidThisMonth,
          unpaidBills,
          paymentCount: tenantPayments.length
        }
      })
      .sort((a, b) => {
        const order = { 'Late / Partial': 0, 'Average Payer': 1, 'Good Payer': 2, 'No History': 3 }
        return (order[a.rating] ?? 3) - (order[b.rating] ?? 3)
      })
  }, [tenants, payments, rooms, bills])

  const goodPayers     = tenantSummaries.filter(s => s.rating === 'Good Payer').length
  const latePayers     = tenantSummaries.filter(s => s.rating === 'Late / Partial').length
  const unpaidThisMonth = tenantSummaries.filter(s => !s.paidThisMonth).length

  async function handleExport() {
    setExporting(true)
    setExportMsg('Building your report…')
    try {
      // Pass all data sources so every sheet is fully populated
      await exportRMSReport({ rooms, tenants, payments, bills, maintenanceLogs })
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
    { title: 'Total Tenants',    value: tenants.length,  icon: FaUsers,     accent: 'var(--primary)', sub: 'Ever registered' },
    { title: 'Active Tenants',   value: a.active,        icon: FaUserCheck, accent: 'var(--success)', sub: 'Currently renting' },
    { title: 'Former Tenants',   value: a.former,        icon: FaUserTimes, accent: 'var(--info)',    sub: 'Past tenants' },
  ]
  const inventoryCards = [
    { title: 'Available Units',  value: a.available, icon: FaBuilding,  accent: 'var(--info)',    sub: 'Ready to reserve' },
    { title: 'Reserved Units',   value: a.reserved,  icon: FaClock,     accent: 'var(--warning)', sub: 'Reservation hold' },
    { title: 'Occupied Units',   value: a.occupied,  icon: FaUserCheck, accent: 'var(--danger)',  sub: 'Active tenant assigned' },
  ]
  const payerCards = [
    { title: 'Good Payers',        value: goodPayers,              icon: FaStar,                accent: 'var(--success)', sub: '≥90% on-time' },
    { title: 'Late / Partial',     value: latePayers,              icon: FaExclamationTriangle, accent: 'var(--danger)',  sub: 'Needs follow-up' },
    { title: 'Unpaid This Month',  value: unpaidThisMonth,         icon: FaClock,               accent: 'var(--warning)', sub: 'No payment yet' },
    { title: 'Overdue Bills',      value: a.overdueBills,          icon: FaFileInvoiceDollar,   accent: 'var(--danger)',  sub: 'Utilities overdue' },
  ]
  const maintenanceCards = [
    { title: 'Pending Repairs',    value: a.pendingMaintenance,    icon: FaTools,               accent: 'var(--warning)', sub: 'Awaiting action' },
    { title: 'In Progress',        value: a.inProgressMaintenance, icon: FaClock,               accent: 'var(--primary)', sub: 'Being worked on' },
    { title: 'Total Repair Cost',  value: formatCurrency(a.totalMaintenanceCost), icon: FaExclamationTriangle, accent: 'var(--danger)', sub: 'Excl. cancelled' },
  ]

  if (loading) {
    return (
      <div className="dashboard-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <FaSpinner className="spin" style={{ fontSize: 32, color: 'var(--primary)' }} />
      </div>
    )
  }

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
        <button
          className="btn-secondary"
          type="button"
          onClick={load}
          title="Refresh all report data"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <FaSync /> Refresh
        </button>
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

      <div className="report-section-label">Payer &amp; Bills Analytics</div>
      <section className="cards-grid cards-grid--4">
        {payerCards.map((c, i) => (
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

      <div className="report-section-label">Maintenance Analytics</div>
      <section className="cards-grid cards-grid--3">
        {maintenanceCards.map((c, i) => (
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

      {/* ── Tenant Payer Overview ── */}
      <div className="white-card report-wide">
        <h3>Tenant Payer Overview</h3>
        <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 16 }}>
          Active tenants sorted by payment reliability. Overdue / partial payers shown first.
        </p>
        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Monthly Rent</th>
                <th>Total Paid</th>
                <th>Payments</th>
                <th>Unpaid Bills</th>
                <th>Paid This Month</th>
                <th>Payer Rating</th>
              </tr>
            </thead>
            <tbody>
              {tenantSummaries.map(({ tenant, room, monthlyRent, totalPaid, rating, paidThisMonth, unpaidBills, paymentCount }) => (
                <tr key={tenant.id}>
                  <td><strong>{tenant.full_name}</strong></td>
                  <td>{room?.room_number || '—'}</td>
                  <td>{formatCurrency(monthlyRent)}</td>
                  <td>{formatCurrency(totalPaid)}</td>
                  <td>{paymentCount}</td>
                  <td style={{ color: unpaidBills > 0 ? '#fda4af' : 'inherit' }}>
                    {unpaidBills > 0 ? formatCurrency(unpaidBills) : '—'}
                  </td>
                  <td>
                    <span className={`status-badge status-${paidThisMonth ? 'paid' : 'pending'}`}>
                      {paidThisMonth ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${payerRatingClass(rating)}`}>
                      {rating}
                    </span>
                  </td>
                </tr>
              ))}
              {tenantSummaries.length === 0 && (
                <tr><td className="empty-state" colSpan="8">No active tenants.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Unit Inventory ── */}
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

      {/* ── Bills Overview ── */}
      <div className="white-card report-wide">
        <h3>Bills Overview</h3>
        <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 16 }}>
          Unpaid and overdue bills across all tenants.
          Total unpaid: <strong style={{ color: '#fda4af' }}>{formatCurrency(a.totalBillsUnpaid)}</strong>
        </p>
        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr><th>Tenant</th><th>Bill Type</th><th>Amount</th><th>Month</th><th>Due Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bills
                .filter(b => b.status !== 'Paid')
                .map(bill => {
                  const tenant = tenants.find(t => String(t.id) === String(bill.tenant_id))
                  return (
                    <tr key={bill.id}>
                      <td>{tenant?.full_name || '—'}</td>
                      <td>{bill.bill_type}</td>
                      <td>₱{Number(bill.amount || 0).toLocaleString()}</td>
                      <td>{bill.billing_month || '—'}</td>
                      <td>{bill.due_date || '—'}</td>
                      <td>
                        <span className={`status-badge status-${bill.status === 'Overdue' ? 'pending' : 'partial'}`}>
                          {bill.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              {bills.filter(b => b.status !== 'Paid').length === 0 && (
                <tr><td className="empty-state" colSpan="6">All bills are paid. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Maintenance Overview ── */}
      <div className="white-card report-wide">
        <h3>Maintenance Overview</h3>
        <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 16 }}>
          Open and in-progress maintenance requests across all units.
          Total cost (excl. cancelled): <strong style={{ color: '#fda4af' }}>{formatCurrency(a.totalMaintenanceCost)}</strong>
        </p>
        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr><th>Unit</th><th>Type</th><th>Description</th><th>Reported</th><th>Cost</th><th>Status</th></tr>
            </thead>
            <tbody>
              {maintenanceLogs
                .filter(l => l.status !== 'Completed' && l.status !== 'Cancelled')
                .map(log => {
                  const room = rooms.find(r => String(r.id) === String(log.room_id))
                  return (
                    <tr key={log.id}>
                      <td>{room?.room_number || '—'}</td>
                      <td>{log.type}</td>
                      <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.description}
                      </td>
                      <td>{log.reported_date || '—'}</td>
                      <td>{log.cost != null ? `₱${Number(log.cost).toLocaleString()}` : '—'}</td>
                      <td>
                        <span className={`status-badge status-${log.status === 'In Progress' ? 'partial' : 'pending'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              {maintenanceLogs.filter(l => l.status !== 'Completed' && l.status !== 'Cancelled').length === 0 && (
                <tr><td className="empty-state" colSpan="6">No open maintenance requests. ✅</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Export Center ── */}
      <div className="white-card report-wide export-center">
        <h3>Export Report</h3>
        <p className="export-desc">
          Downloads a complete, professionally styled Excel workbook with 6 tabs — all populated from your live data.
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
            { sheet: 'Summary',          desc: 'KPI overview — occupancy, financials, tenants' },
            { sheet: 'Unit Inventory',   desc: 'All units with rent, status & current tenant' },
            { sheet: 'Tenant List',      desc: 'Contact info, move-in dates, balance due' },
            { sheet: 'Payment History',  desc: 'Every payment sorted newest-first with status' },
            { sheet: 'Monthly Revenue',  desc: 'Month-by-month boarding vs rental space totals' },
            { sheet: 'Bills & Maintenance', desc: 'Unpaid bills and open maintenance requests' },
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