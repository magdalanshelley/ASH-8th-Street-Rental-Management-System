/**
 * exportReport.js
 * Generates a styled multi-sheet Excel report for 8th Street RMS.
 * Supports: overall export OR filtered by selected months.
 *
 * Usage:
 *   import { exportRMSReport } from './exportReport'
 *   await exportRMSReport({ rooms, tenants, payments, bills, maintenanceLogs, selectedMonths: ['2025-01'] })
 *   // pass selectedMonths: null / [] for all-time
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { getPaymentStatusValue, summarizeTenantMonth } from './rmsBusiness'

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  dark:   '1E293B',
  light:  'F1F5F9',
  accent: '6366F1',
  green:  '16A34A',
  amber:  'D97706',
  red:    'DC2626',
  border: 'CBD5E1',
  subhdr: '334155',
  teal:   '0F766E',
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const hdrFont   = (sz = 11) => ({ name: 'Arial', size: sz, bold: true, color: { argb: 'FFFFFFFF' } })
const bodyFont  = (bold = false, color = P.dark) => ({ name: 'Arial', size: 10, bold, color: { argb: 'FF' + color } })
const fillSolid = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } })
const thinBorder = () => {
  const s = { style: 'thin', color: { argb: 'FF' + P.border } }
  return { top: s, left: s, bottom: s, right: s }
}
const center = { horizontal: 'center', vertical: 'middle' }
const left   = { horizontal: 'left',   vertical: 'middle' }

function addHeaderRow(ws, labels, widths) {
  const row = ws.addRow(labels)
  row.height = 22
  row.eachCell(cell => {
    cell.font      = hdrFont()
    cell.fill      = fillSolid(P.dark)
    cell.alignment = center
    cell.border    = thinBorder()
  })
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

function addSectionRow(ws, label, colSpan) {
  const row = ws.addRow([label])
  ws.mergeCells(row.number, 1, row.number, colSpan)
  row.getCell(1).font      = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  row.getCell(1).fill      = fillSolid(P.subhdr)
  row.getCell(1).alignment = left
  row.height = 20
}

function addTitleBlock(ws, title, sub, colSpan = 8) {
  ws.mergeCells(1, 1, 1, colSpan)
  const t = ws.getCell('A1')
  t.value     = title
  t.font      = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill      = fillSolid(P.accent)
  t.alignment = center
  ws.getRow(1).height = 30

  ws.mergeCells(2, 1, 2, colSpan)
  const s = ws.getCell('A2')
  s.value     = sub || `Generated: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} · 8th Street Rental Management`
  s.font      = { name: 'Arial', size: 9, color: { argb: 'FF' + P.subhdr } }
  s.fill      = fillSolid('E0E7FF')
  s.alignment = center
  ws.getRow(2).height = 16
  ws.addRow([])
}

function styleDataRow(row, colCount, isAlt) {
  const bg = isAlt ? P.light : 'FFFFFF'
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    if (!cell.font?.bold) cell.font = bodyFont()
    cell.fill   = fillSolid(bg)
    cell.border = thinBorder()
    if (!cell.alignment) cell.alignment = left
  }
  row.height = 18
}

const statusColor = {
  Occupied:    P.red,
  Available:   P.green,
  Reserved:    P.amber,
  Active:      P.green,
  Paid:        P.green,
  Pending:     P.red,
  Partial:     P.amber,
  Overdue:     P.red,
  Unpaid:      P.amber,
  Completed:   P.green,
  'In Progress': P.amber,
  Cancelled:   P.subhdr,
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function monthLabel(key) {
  const [yr, mo] = key.split('-')
  return new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })
}

// ── Get all unique months from payments ───────────────────────────────────────
export function getAvailableMonths(payments) {
  const months = new Set()
  for (const p of payments) {
    if (p.payment_date) {
      months.add(p.payment_date.slice(0, 7)) // 'YYYY-MM'
    }
  }
  return [...months].sort().reverse() // newest first
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// selectedMonths: string[] of 'YYYY-MM', or null/[] for all-time
// ─────────────────────────────────────────────────────────────────────────────
export async function exportRMSReport({
  rooms = [],
  tenants = [],
  payments = [],
  bills = [],
  maintenanceLogs = [],
  selectedMonths = null
}) {
  const isFiltered = selectedMonths && selectedMonths.length > 0

  // Filter payments by selected months
  const filteredPayments = isFiltered
    ? payments.filter(p => p.payment_date && selectedMonths.includes(p.payment_date.slice(0, 7)))
    : payments

  const scopeLabel = isFiltered
    ? `Period: ${selectedMonths.map(monthLabel).join(', ')}`
    : 'Period: All Time'

  const wb = new ExcelJS.Workbook()
  wb.creator = '8th Street RMS'
  wb.created = new Date()
  wb.modified = new Date()

  const POTENTIAL = 60000
  const unitMap   = new Map(rooms.map(r => [String(r.id), r]))
  const tenantMap = new Map(tenants.map(t => [String(t.id), t]))

  const unitNo   = r => r.room_number || r.name || `Unit ${r.id}`
  const unitType = r => {
    if (r.room_type === 'rental_space' || r.room_type === 'commercial' || unitNo(r).startsWith('RS'))
      return 'Rental Space'
    return 'Boarding Room'
  }
  const tenantForRoom = room => tenants.find(t =>
    String(t.assigned_room_id) === String(room.id) && (t.status === 'Active' || t.is_active)
  )

  // Always resolve the unit through unitMap so we get the current status, not
  // whatever may be cached in the nested tenants join on the payment row.
  const resolveUnit = (p) => {
    const tenant = p.tenants || tenantMap.get(String(p.tenant_id))
    return tenant?.assigned_room_id ? unitMap.get(String(tenant.assigned_room_id)) : null
  }

  // ══════════════════════════════════════════════════════════════════
  // SHEET 1 — SUMMARY
  // ══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws1.getColumn(1).width = 32
  ws1.getColumn(2).width = 24
  addTitleBlock(ws1, '8TH STREET RENTAL MANAGEMENT — REPORT SUMMARY', scopeLabel, 2)

  const occupied      = rooms.filter(r => r.status === 'Occupied').length
  const available     = rooms.filter(r => r.status === 'Available').length
  const reserved      = rooms.filter(r => r.status === 'Reserved').length
  const totalCollected = filteredPayments.reduce((s, p) => s + Number(p.amount_paid || p.amount || 0), 0)
  const activeTenants = tenants.filter(t => t.status === 'Active' || t.is_active).length

  // Bills summary
  const totalUnpaidBills = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)
  const overdueBillsCount = bills.filter(b => b.status === 'Overdue').length

  // Maintenance summary
  const openMaintenance = maintenanceLogs.filter(l => l.status === 'Pending' || l.status === 'In Progress').length
  const totalMaintenanceCost = maintenanceLogs
    .filter(l => l.status !== 'Cancelled')
    .reduce((s, l) => s + Number(l.cost || 0), 0)

  const kpiGroups = [
    { heading: 'PROPERTY', rows: [
      ['Total Rental Units',      rooms.length],
      ['Boarding Rooms',          rooms.filter(r => unitType(r) === 'Boarding Room').length],
      ['Rental Spaces',           rooms.filter(r => unitType(r) === 'Rental Space').length],
      ['Potential Monthly (PHP)', POTENTIAL],
    ]},
    { heading: 'OCCUPANCY', rows: [
      ['Occupied Units',   occupied],
      ['Available Units',  available],
      ['Reserved Units',   reserved],
      ['Occupancy Rate',   rooms.length ? occupied / rooms.length : 0, '0.0%'],
    ]},
    { heading: `FINANCIALS (${scopeLabel})`, rows: [
      ['Payments in Scope',                filteredPayments.length],
      ['Total Revenue Collected (PHP)',     totalCollected, '#,##0'],
      ['Pending / Unpaid',                 filteredPayments.filter(p => getPaymentStatusValue(p, p.tenants || tenantMap.get(String(p.tenant_id)), rooms).toLowerCase() === 'pending').length],
      ['Partial Payments',                 filteredPayments.filter(p => getPaymentStatusValue(p, p.tenants || tenantMap.get(String(p.tenant_id)), rooms).toLowerCase() === 'partial').length],
    ]},
    { heading: 'TENANTS', rows: [
      ['Total Tenants',      tenants.length],
      ['Active Tenants',     activeTenants],
      ['Former / Inactive',  tenants.length - activeTenants],
    ]},
    { heading: 'BILLS', rows: [
      ['Total Bills',              bills.length],
      ['Unpaid Bills Amount (PHP)', totalUnpaidBills, '#,##0'],
      ['Overdue Bills',            overdueBillsCount],
      ['Paid Bills',               bills.filter(b => b.status === 'Paid').length],
    ]},
    { heading: 'MAINTENANCE', rows: [
      ['Total Logs',               maintenanceLogs.length],
      ['Open (Pending/In Progress)', openMaintenance],
      ['Completed',                maintenanceLogs.filter(l => l.status === 'Completed').length],
      ['Total Repair Cost (PHP)',  totalMaintenanceCost, '#,##0'],
    ]},
  ]

  let summaryRowIdx = 3
  for (const group of kpiGroups) {
    addSectionRow(ws1, group.heading, 2)
    summaryRowIdx++
    for (const [label, value, fmt] of group.rows) {
      const r   = ws1.addRow([label, value])
      const alt = summaryRowIdx % 2 === 0
      const bg  = alt ? P.light : 'FFFFFF'
      const lc  = r.getCell(1)
      const vc  = r.getCell(2)
      lc.font = bodyFont(); lc.fill = fillSolid(bg); lc.border = thinBorder(); lc.alignment = left
      vc.font = bodyFont(true); vc.fill = fillSolid(bg); vc.border = thinBorder(); vc.alignment = center
      if (fmt) vc.numFmt = fmt
      r.height = 18
      summaryRowIdx++
    }
    ws1.addRow([])
    summaryRowIdx++
  }

  // ══════════════════════════════════════════════════════════════════
  // SHEET 2 — UNIT INVENTORY
  // ══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Unit Inventory', { views: [{ showGridLines: false }] })
  addTitleBlock(ws2, 'UNIT INVENTORY', scopeLabel, 6)
  addHeaderRow(ws2,
    ['Unit Number', 'Unit Type', 'Monthly Rent (PHP)', 'Status', 'Current Tenant', 'Notes'],
    [14, 18, 22, 16, 28, 28]
  )

  rooms.forEach((room, i) => {
    const t    = tenantForRoom(room)
    const rent = Number(room.monthly_rent || 0)
    const row  = ws2.addRow([unitNo(room), unitType(room), rent, room.status || 'Available', t?.full_name || '—', ''])
    styleDataRow(row, 6, i % 2 === 0)
    row.getCell(1).font = bodyFont(true)
    row.getCell(3).numFmt = '#,##0'; row.getCell(3).alignment = center
    const sc = row.getCell(4)
    sc.font = bodyFont(true, statusColor[room.status] || P.dark); sc.alignment = center
  })

  if (rooms.length === 0) {
    ws2.addRow(['No units found.', '', '', '', '', ''])
  }

  // ══════════════════════════════════════════════════════════════════
  // SHEET 3 — TENANT LIST
  // ══════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Tenant List', { views: [{ showGridLines: false }] })
  addTitleBlock(ws3, 'TENANT LIST', scopeLabel, 9)
  addHeaderRow(ws3,
    ['#', 'Full Name', 'Unit', 'Phone', 'Check-in Date', 'Contract End', 'Status', 'Monthly Rent (PHP)', 'Balance Due (PHP)'],
    [5, 24, 14, 16, 16, 16, 12, 22, 20]
  )

  tenants.forEach((t, i) => {
    const assignedRoom = t.assigned_room_id ? unitMap.get(String(t.assigned_room_id)) : null
    const rent = assignedRoom ? Number(assignedRoom.monthly_rent || 0) : 0
    const balance = summarizeTenantMonth(t, filteredPayments, rooms).outstandingBalance

    let contractEnd = '—'
    if (t.check_in_date && t.contract_duration) {
      const end = new Date(t.check_in_date)
      end.setMonth(end.getMonth() + Number(t.contract_duration))
      contractEnd = fmtDate(end.toISOString())
    }

    const statusLabel = t.status || (t.is_active ? 'Active' : 'Inactive')
    const row = ws3.addRow([
      i + 1,
      t.full_name || '—',
      assignedRoom ? unitNo(assignedRoom) : '—',
      t.contact_number || t.phone || '—',
      fmtDate(t.check_in_date),
      contractEnd,
      statusLabel,
      rent,
      balance
    ])
    styleDataRow(row, 9, i % 2 === 0)
    row.getCell(2).font = bodyFont(true)
    ;[8, 9].forEach(c => { row.getCell(c).numFmt = '#,##0'; row.getCell(c).alignment = center })
    ;[1, 5, 6, 7].forEach(c => row.getCell(c).alignment = center)
    row.getCell(7).font = bodyFont(true, statusColor[statusLabel] || P.dark)
  })

  if (tenants.length === 0) {
    ws3.addRow(['', 'No tenants found.', '', '', '', '', '', '', ''])
  }

  // ══════════════════════════════════════════════════════════════════
  // SHEET 4 — PAYMENT HISTORY
  // ══════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('Payment History', { views: [{ showGridLines: false }] })
  addTitleBlock(ws4, 'PAYMENT HISTORY', scopeLabel, 7)
  addHeaderRow(ws4,
    ['#', 'Tenant Name', 'Unit', 'Payment Date', 'Amount Paid (PHP)', 'Method', 'Status'],
    [5, 24, 12, 16, 22, 16, 14]
  )

  let payTotal = 0
  const sortedPayments = [...filteredPayments].sort(
    (a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0)
  )

  sortedPayments.forEach((p, i) => {
    const tenant = p.tenants || tenantMap.get(String(p.tenant_id))
    const tName  = tenant?.full_name || `Tenant #${p.tenant_id}`
    // Use resolveUnit so we always look up the authoritative room from unitMap
    const room   = resolveUnit(p)
    const unit   = room ? unitNo(room) : '—'
    const amount = Number(p.amount_paid || p.amount || 0)
    const statusLabel = getPaymentStatusValue(p, tenant, rooms)
    payTotal += amount

    const row = ws4.addRow([i + 1, tName, unit, fmtDate(p.payment_date), amount, p.payment_method || '—', statusLabel])
    styleDataRow(row, 7, i % 2 === 0)
    row.getCell(2).font = bodyFont(true)
    row.getCell(5).numFmt = '#,##0'
    ;[1, 4, 5, 7].forEach(c => row.getCell(c).alignment = center)
    row.getCell(7).font = bodyFont(true, statusColor[statusLabel] || P.dark)
  })

  if (sortedPayments.length === 0) {
    ws4.addRow(['', 'No payments in selected period.', '', '', '', '', ''])
  }

  // Total row
  const payTotalRow = ws4.addRow(['TOTAL', '', '', '', payTotal, '', ''])
  payTotalRow.height = 20
  for (let c = 1; c <= 7; c++) {
    const cell = payTotalRow.getCell(c)
    cell.font = hdrFont(); cell.fill = fillSolid(P.dark); cell.border = thinBorder(); cell.alignment = center
  }
  payTotalRow.getCell(5).numFmt = '#,##0'

  // ══════════════════════════════════════════════════════════════════
  // SHEET 5 — MONTHLY BREAKDOWN
  // ══════════════════════════════════════════════════════════════════
  const ws5 = wb.addWorksheet('Monthly Revenue', { views: [{ showGridLines: false }] })
  addTitleBlock(ws5, 'MONTHLY REVENUE BREAKDOWN', scopeLabel, 6)
  addHeaderRow(ws5,
    ['Month', 'Boarding Revenue (PHP)', 'Rental Space Revenue (PHP)', 'Total Revenue (PHP)', 'Potential (PHP)', 'Collection Rate'],
    [20, 26, 28, 22, 16, 16]
  )

  // Group filtered payments by month, resolving unit via unitMap
  const monthMap = {}
  for (const p of filteredPayments) {
    if (!p.payment_date) continue
    const key = p.payment_date.slice(0, 7)
    if (!monthMap[key]) monthMap[key] = { boarding: 0, rental: 0 }
    const room  = resolveUnit(p)
    const isRS  = room && unitType(room) === 'Rental Space'
    const amt   = Number(p.amount_paid || p.amount || 0)
    if (isRS) monthMap[key].rental += amt
    else      monthMap[key].boarding += amt
  }

  const sortedMonths = Object.keys(monthMap).sort()
  let grandBoarding = 0, grandRental = 0

  sortedMonths.forEach((key, i) => {
    const b   = monthMap[key].boarding
    const r   = monthMap[key].rental
    const tot = b + r
    grandBoarding += b
    grandRental   += r

    const row = ws5.addRow([monthLabel(key), b, r, tot, POTENTIAL, tot / POTENTIAL])
    styleDataRow(row, 6, i % 2 === 0)
    ;[2, 3, 4, 5].forEach(c => { row.getCell(c).numFmt = '#,##0'; row.getCell(c).alignment = center })
    row.getCell(6).numFmt = '0.0%'; row.getCell(6).alignment = center
    row.getCell(4).font = bodyFont(true)
  })

  if (sortedMonths.length === 0) {
    ws5.addRow(['No payments in selected period', 0, 0, 0, POTENTIAL, 0])
  }

  const grandTotal = grandBoarding + grandRental
  const mTotRow = ws5.addRow([
    'TOTAL',
    grandBoarding,
    grandRental,
    grandTotal,
    POTENTIAL * Math.max(sortedMonths.length, 1),
    grandTotal / (POTENTIAL * Math.max(sortedMonths.length, 1))
  ])
  mTotRow.height = 20
  for (let c = 1; c <= 6; c++) {
    const cell = mTotRow.getCell(c)
    cell.font = hdrFont(); cell.fill = fillSolid(P.dark); cell.border = thinBorder(); cell.alignment = center
  }
  ;[2, 3, 4, 5].forEach(c => mTotRow.getCell(c).numFmt = '#,##0')
  mTotRow.getCell(6).numFmt = '0.0%'

  // ══════════════════════════════════════════════════════════════════
  // SHEET 6 — BILLS & MAINTENANCE
  // ══════════════════════════════════════════════════════════════════
  const ws6 = wb.addWorksheet('Bills & Maintenance', { views: [{ showGridLines: false }] })
  addTitleBlock(ws6, 'BILLS & MAINTENANCE', scopeLabel, 7)

  // ── Bills section ──────────────────────────────────────────────────
  addSectionRow(ws6, 'BILLS', 7)
  addHeaderRow(ws6,
    ['Tenant', 'Bill Type', 'Amount (PHP)', 'Billing Month', 'Due Date', 'Paid Date', 'Status'],
    [24, 20, 18, 16, 16, 16, 14]
  )

  const sortedBills = [...bills].sort((a, b) => {
    // Overdue first, then Unpaid, then Paid
    const order = { Overdue: 0, Unpaid: 1, Paid: 2 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  sortedBills.forEach((bill, i) => {
    const tenant = tenantMap.get(String(bill.tenant_id))
    const amt = Number(bill.amount || 0)
    const row = ws6.addRow([
      tenant?.full_name || '—',
      bill.bill_type || '—',
      amt,
      bill.billing_month || '—',
      fmtDate(bill.due_date),
      fmtDate(bill.paid_date),
      bill.status || 'Unpaid'
    ])
    styleDataRow(row, 7, i % 2 === 0)
    row.getCell(1).font = bodyFont(true)
    row.getCell(3).numFmt = '#,##0'; row.getCell(3).alignment = center
    ;[4, 5, 6].forEach(c => row.getCell(c).alignment = center)
    row.getCell(7).font = bodyFont(true, statusColor[bill.status] || P.dark)
    row.getCell(7).alignment = center
  })

  if (bills.length === 0) {
    ws6.addRow(['No bills recorded.', '', '', '', '', '', ''])
  }

  // Bills total row
  const billsTotal = bills.reduce((s, b) => s + Number(b.amount || 0), 0)
  const billsUnpaidTotal = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + Number(b.amount || 0), 0)
  const billsTotRow = ws6.addRow(['TOTAL', '', billsTotal, '', '', `Unpaid: ₱${billsUnpaidTotal.toLocaleString()}`, ''])
  billsTotRow.height = 20
  for (let c = 1; c <= 7; c++) {
    const cell = billsTotRow.getCell(c)
    cell.font = hdrFont(); cell.fill = fillSolid(P.dark); cell.border = thinBorder(); cell.alignment = center
  }
  billsTotRow.getCell(3).numFmt = '#,##0'

  ws6.addRow([])

  // ── Maintenance section ────────────────────────────────────────────
  addSectionRow(ws6, 'MAINTENANCE LOGS', 7)
  addHeaderRow(ws6,
    ['Unit', 'Type', 'Description', 'Reported Date', 'Resolved Date', 'Cost (PHP)', 'Status'],
    [14, 16, 32, 16, 16, 16, 14]
  )

  const sortedMaintenance = [...maintenanceLogs].sort((a, b) => {
    const order = { Pending: 0, 'In Progress': 1, Completed: 2, Cancelled: 3 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  sortedMaintenance.forEach((log, i) => {
    const room = unitMap.get(String(log.room_id))
    const cost = log.cost != null ? Number(log.cost) : null
    const row = ws6.addRow([
      room?.room_number || '—',
      log.type || '—',
      log.description || '—',
      fmtDate(log.reported_date),
      fmtDate(log.resolved_date),
      cost,
      log.status || 'Pending'
    ])
    styleDataRow(row, 7, i % 2 === 0)
    row.getCell(1).font = bodyFont(true)
    if (cost != null) { row.getCell(6).numFmt = '#,##0'; row.getCell(6).alignment = center }
    ;[4, 5].forEach(c => row.getCell(c).alignment = center)
    row.getCell(7).font = bodyFont(true, statusColor[log.status] || P.dark)
    row.getCell(7).alignment = center
  })

  if (maintenanceLogs.length === 0) {
    ws6.addRow(['No maintenance logs recorded.', '', '', '', '', '', ''])
  }

  // Maintenance cost total row
  const maintTotal = maintenanceLogs
    .filter(l => l.status !== 'Cancelled')
    .reduce((s, l) => s + Number(l.cost || 0), 0)
  const maintTotRow = ws6.addRow(['TOTAL (excl. Cancelled)', '', '', '', '', maintTotal, ''])
  maintTotRow.height = 20
  for (let c = 1; c <= 7; c++) {
    const cell = maintTotRow.getCell(c)
    cell.font = hdrFont(); cell.fill = fillSolid(P.dark); cell.border = thinBorder(); cell.alignment = center
  }
  maintTotRow.getCell(6).numFmt = '#,##0'

  // ── Freeze panes & tab colors ──────────────────────────────────────────────
  // ySplit: 3 freezes rows 1–2 (title block) + header row, keeping column
  // labels visible while scrolling data rows.
  for (const [ws, color] of [
    [ws1, P.accent],
    [ws2, P.subhdr],
    [ws3, P.green],
    [ws4, P.amber],
    [ws5, P.red],
    [ws6, P.teal]
  ]) {
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]
    ws.tabColor = { argb: 'FF' + color }
  }

  // ── Write and download ─────────────────────────────────────────────────────
  const buf     = await wb.xlsx.writeBuffer()
  const blob    = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const dateStr = new Date().toISOString().slice(0, 10)
  const suffix  = isFiltered && selectedMonths.length === 1
    ? `_${selectedMonths[0]}`
    : isFiltered
    ? `_${selectedMonths.length}months`
    : '_AllTime'
  saveAs(blob, `8thStreet_RMS_Report${suffix}_${dateStr}.xlsx`)
}