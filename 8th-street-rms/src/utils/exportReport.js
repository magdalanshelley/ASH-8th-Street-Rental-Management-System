/**
 * exportReport.js
 * Generates a styled multi-sheet Excel report for 8th Street RMS.
 * Uses ExcelJS (browser-compatible). Install: npm install exceljs
 *
 * Usage:
 *   import { exportRMSReport } from './exportReport'
 *   await exportRMSReport({ rooms, tenants, payments })
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'  // npm install file-saver
import { getPaymentStatusValue, summarizeTenantMonth } from './rmsBusiness'

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  dark:    '1E293B',
  light:   'F1F5F9',
  white:   'FFFFFFFF',
  accent:  '6366F1',
  green:   '16A34A',
  amber:   'D97706',
  red:     'DC2626',
  border:  'CBD5E1',
  subhdr:  '334155',
  lightBg: 'EEF2FF',   // tint for every-other row
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const hdrFont  = (sz = 11) => ({ name: 'Arial', size: sz, bold: true, color: { argb: 'FFFFFFFF' } })
const bodyFont = (bold = false, color = P.dark) => ({ name: 'Arial', size: 10, bold, color: { argb: 'FF' + color } })
const fillSolid = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } })
const thinBorder = () => {
  const s = { style: 'thin', color: { argb: 'FF' + P.border } }
  return { top: s, left: s, bottom: s, right: s }
}
const center = { horizontal: 'center', vertical: 'middle' }
const left   = { horizontal: 'left',   vertical: 'middle' }

// ── Apply a styled header row ──────────────────────────────────────────────────
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

// ── Section heading (merged, dark bg) ─────────────────────────────────────────
function addSectionRow(ws, label, colSpan) {
  const row = ws.addRow([label])
  ws.mergeCells(row.number, 1, row.number, colSpan)
  row.getCell(1).font      = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  row.getCell(1).fill      = fillSolid(P.subhdr)
  row.getCell(1).alignment = left
  row.height = 20
}

// ── Title block (rows 1-2) ─────────────────────────────────────────────────────
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

  // blank spacer row
  ws.addRow([])
}

// ── Style alternating data rows ───────────────────────────────────────────────
function styleDataRow(row, colCount, isAlt) {
  const bg = isAlt ? P.light : 'FFFFFF'
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    if (!cell.font) cell.font = bodyFont()
    cell.fill   = fillSolid(bg)
    cell.border = thinBorder()
    if (!cell.alignment) cell.alignment = left
  }
  row.height = 18
}

// ── Status colour map ─────────────────────────────────────────────────────────
const statusColor = {
  Occupied:  P.red,
  Available: P.green,
  Reserved:  P.amber,
  Active:    P.green,
  Former:    P.subhdr,
  Inactive:  P.subhdr,
  Paid:      P.green,
  Pending:   P.red,
  Partial:   P.amber,
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function exportRMSReport({ rooms = [], tenants = [], payments = [] }) {
  const wb = new ExcelJS.Workbook()
  wb.creator    = '8th Street RMS'
  wb.lastModifiedBy = '8th Street RMS'
  wb.created    = new Date()
  wb.modified   = new Date()

  const POTENTIAL = 60000   // PHP — fixed for this 8-unit property

  // ── Helpers ────────────────────────────────────────────────────────────────
  const unitMap   = new Map(rooms.map(r => [String(r.id), r]))
  const tenantMap = new Map(tenants.map(t => [String(t.id), t]))

  // Derive a unit number from room data
  const unitNo = r => r.room_number || r.name || `Unit ${r.id}`
  const unitType = r => {
    if (r.room_type === 'rental_space' || r.room_type === 'commercial' || unitNo(r).startsWith('RS'))
      return 'Rental Space'
    return 'Boarding Room'
  }

  // Tenant assigned to a room
  const tenantForRoom = room => tenants.find(t =>
    String(t.assigned_room_id) === String(room.id) && (t.status === 'Active' || t.is_active)
  )

  // ══════════════════════════════════════════════════════════════════
  // SHEET 1 — SUMMARY
  // ══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws1.getColumn(1).width = 32
  ws1.getColumn(2).width = 24
  addTitleBlock(ws1, '8TH STREET RENTAL MANAGEMENT — REPORT SUMMARY', null, 2)

  const occupied  = rooms.filter(r => r.status === 'Occupied').length
  const available = rooms.filter(r => r.status === 'Available').length
  const reserved  = rooms.filter(r => r.status === 'Reserved').length
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_paid || p.amount || 0), 0)
  const activeTenants = tenants.filter(t => t.status === 'Active' || t.is_active).length
  const occupancyRate = rooms.length ? (occupied / rooms.length) : 0

  const kpiGroups = [
    { heading: 'PROPERTY', rows: [
      ['Total Rental Units',      rooms.length],
      ['Boarding Rooms',          rooms.filter(r => unitType(r) === 'Boarding Room').length],
      ['Rental Spaces',           rooms.filter(r => unitType(r) === 'Rental Space').length],
      ['Potential Monthly (PHP)', POTENTIAL],
    ]},
    { heading: 'OCCUPANCY', rows: [
      ['Occupied Units',  occupied],
      ['Available Units', available],
      ['Reserved Units',  reserved],
      ['Occupancy Rate',  occupancyRate, '0.0%'],
    ]},
    { heading: 'FINANCIALS', rows: [
      ['Total Payments Recorded', payments.length],
      ['Total Revenue Collected (PHP)', totalPaid, '#,##0'],
      ['Pending / Unpaid',        payments.filter(p => getPaymentStatusValue(p, p.tenants || tenantMap.get(String(p.tenant_id)), rooms).toLowerCase() === 'pending').length],
      ['Partial Payments',        payments.filter(p => getPaymentStatusValue(p, p.tenants || tenantMap.get(String(p.tenant_id)), rooms).toLowerCase() === 'partial').length],
    ]},
    { heading: 'TENANTS', rows: [
      ['Total Tenants',     tenants.length],
      ['Active Tenants',    activeTenants],
      ['Former / Inactive', tenants.length - activeTenants],
    ]},
  ]

  let summaryRow = 3
  for (const group of kpiGroups) {
    addSectionRow(ws1, group.heading, 2)
    summaryRow++
    for (const [label, value, fmt] of group.rows) {
      const r = ws1.addRow([label, value])
      const alt = (summaryRow % 2 === 0)
      const bg  = alt ? P.light : 'FFFFFF'
      const lc  = r.getCell(1)
      const vc  = r.getCell(2)
      lc.font = bodyFont(); lc.fill = fillSolid(bg); lc.border = thinBorder(); lc.alignment = left
      vc.font = bodyFont(true); vc.fill = fillSolid(bg); vc.border = thinBorder(); vc.alignment = center
      if (fmt) vc.numFmt = fmt
      r.height = 18
      summaryRow++
    }
    ws1.addRow([])
    summaryRow++
  }

  // ══════════════════════════════════════════════════════════════════
  // SHEET 2 — UNIT INVENTORY
  // ══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Unit Inventory', { views: [{ showGridLines: false }] })
  addTitleBlock(ws2, 'UNIT INVENTORY — 8TH STREET RENTAL PROPERTY', null, 6)

  addHeaderRow(ws2,
    ['Unit Number', 'Unit Type', 'Monthly Rent (PHP)', 'Status', 'Current Tenant', 'Notes'],
    [14, 18, 22, 16, 28, 28]
  )

  let invTotal = 0
  rooms.forEach((room, i) => {
    const t   = tenantForRoom(room)
    const rent = Number(room.monthly_rent || 0)
    invTotal += rent
    const row = ws2.addRow([
      unitNo(room),
      unitType(room),
      rent,
      room.status || 'Available',
      t ? t.full_name : '—',
      ''
    ])
    styleDataRow(row, 6, i % 2 === 0)
    row.getCell(1).font = bodyFont(true)
    row.getCell(3).numFmt = '#,##0'
    row.getCell(3).alignment = center

    const statusCell = row.getCell(4)
    statusCell.font = bodyFont(true, statusColor[room.status] || P.dark)
    statusCell.alignment = center
  })

  // Total row
  const invTotalRow = ws2.addRow(['TOTAL', '', invTotal, '', '', ''])
  invTotalRow.height = 20
  for (let c = 1; c <= 6; c++) {
    const cell = invTotalRow.getCell(c)
    cell.font   = hdrFont()
    cell.fill   = fillSolid(P.dark)
    cell.border = thinBorder()
    cell.alignment = center
  }
  invTotalRow.getCell(3).numFmt = '#,##0'

  // ══════════════════════════════════════════════════════════════════
  // SHEET 3 — TENANT LIST
  // ══════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet('Tenant List', { views: [{ showGridLines: false }] })
  addTitleBlock(ws3, 'TENANT LIST — ALL REGISTERED TENANTS', null, 9)

  addHeaderRow(ws3,
    ['#', 'Full Name', 'Unit Assigned', 'Phone', 'Email', 'Move-in Date', 'Status', 'Monthly Rent (PHP)', 'Balance Due (PHP)'],
    [5, 24, 14, 16, 28, 14, 12, 22, 20]
  )

  tenants.forEach((t, i) => {
    const assignedRoom = t.assigned_room_id ? unitMap.get(String(t.assigned_room_id)) : null
    const movein = t.move_in_date || t.start_date || t.created_at || ''
    const statusLabel = t.status || (t.is_active ? 'Active' : 'Inactive')
    const rent = assignedRoom ? Number(assignedRoom.monthly_rent || 0) : 0
    const balance = summarizeTenantMonth(t, payments, rooms).outstandingBalance

    const row = ws3.addRow([
      i + 1,
      t.full_name || t.name || '—',
      assignedRoom ? unitNo(assignedRoom) : (t.assigned_room || '—'),
      t.phone || t.contact_number || '—',
      t.email || '—',
      movein ? new Date(movein).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
      statusLabel,
      rent,
      balance
    ])

    styleDataRow(row, 9, i % 2 === 0)
    row.getCell(2).font = bodyFont(true)
    ;[8, 9].forEach(c => { row.getCell(c).numFmt = '#,##0'; row.getCell(c).alignment = center })
    ;[1, 6, 7].forEach(c => row.getCell(c).alignment = center)

    const sc = row.getCell(7)
    sc.font = bodyFont(true, statusColor[statusLabel] || P.dark)
  })

  // ══════════════════════════════════════════════════════════════════
  // SHEET 4 — PAYMENT HISTORY
  // ══════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet('Payment History', { views: [{ showGridLines: false }] })
  addTitleBlock(ws4, 'PAYMENT HISTORY — ALL TRANSACTIONS', null, 7)

  addHeaderRow(ws4,
    ['#', 'Tenant Name', 'Unit', 'Payment Date', 'Amount Paid (PHP)', 'Status', 'Notes'],
    [5, 24, 12, 16, 22, 12, 28]
  )

  let payTotal = 0
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0)
  )

  sortedPayments.forEach((p, i) => {
    const tenant = p.tenants || tenantMap.get(String(p.tenant_id))
    const tName  = tenant?.full_name || tenant?.name || `Tenant #${p.tenant_id}`
    const room   = tenant?.assigned_room_id ? unitMap.get(String(tenant.assigned_room_id)) : null
    const unit   = room ? unitNo(room) : (p.room_number || '—')
    const amount = Number(p.amount_paid || p.amount || 0)
    const statusLabel = getPaymentStatusValue(p, tenant, rooms)
    payTotal += amount

    const dateStr = p.payment_date
      ? new Date(p.payment_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—'

    const row = ws4.addRow([i + 1, tName, unit, dateStr, amount, statusLabel, p.notes || ''])
    styleDataRow(row, 7, i % 2 === 0)
    row.getCell(2).font = bodyFont(true)
    row.getCell(5).numFmt = '#,##0'
    ;[1, 4, 5, 6].forEach(c => row.getCell(c).alignment = center)

    const sc = row.getCell(6)
    sc.font = bodyFont(true, statusColor[statusLabel] || P.dark)
  })

  // Totals row
  const payTotalRow = ws4.addRow(['TOTAL', '', '', '', payTotal, '', ''])
  payTotalRow.height = 20
  for (let c = 1; c <= 7; c++) {
    const cell = payTotalRow.getCell(c)
    cell.font   = hdrFont()
    cell.fill   = fillSolid(P.dark)
    cell.border = thinBorder()
    cell.alignment = center
  }
  payTotalRow.getCell(5).numFmt = '#,##0'

  // ══════════════════════════════════════════════════════════════════
  // SHEET 5 — MONTHLY REVENUE
  // ══════════════════════════════════════════════════════════════════
  const ws5 = wb.addWorksheet('Monthly Revenue', { views: [{ showGridLines: false }] })
  addTitleBlock(ws5, 'MONTHLY REVENUE BREAKDOWN BY UNIT TYPE', null, 6)

  addHeaderRow(ws5,
    ['Month', 'Boarding Room Revenue (PHP)', 'Rental Space Revenue (PHP)', 'Total Revenue (PHP)', 'Potential (PHP)', 'Collection Rate'],
    [20, 28, 28, 22, 16, 16]
  )

  // Group payments by month
  const monthMap = {}
  for (const p of payments) {
    if (!p.payment_date) continue
    const d   = new Date(p.payment_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthMap[key]) monthMap[key] = { boarding: 0, rental: 0 }

    const tenant = p.tenants || tenantMap.get(String(p.tenant_id))
    const room   = tenant?.assigned_room_id ? unitMap.get(String(tenant.assigned_room_id)) : null
    const isRS   = room && unitType(room) === 'Rental Space'
    const amt    = Number(p.amount_paid || p.amount || 0)
    if (isRS) monthMap[key].rental += amt
    else      monthMap[key].boarding += amt
  }

  const sortedMonths = Object.keys(monthMap).sort()
  let monthTotal = { boarding: 0, rental: 0 }

  sortedMonths.forEach((key, i) => {
    const [yr, mo] = key.split('-')
    const label = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })
    const b = monthMap[key].boarding
    const r = monthMap[key].rental
    const tot = b + r
    monthTotal.boarding += b
    monthTotal.rental   += r

    const row = ws5.addRow([label, b, r, tot, POTENTIAL, tot / POTENTIAL])
    styleDataRow(row, 6, i % 2 === 0)
    ;[2, 3, 4, 5].forEach(c => { row.getCell(c).numFmt = '#,##0'; row.getCell(c).alignment = center })
    row.getCell(6).numFmt = '0.0%'; row.getCell(6).alignment = center
    row.getCell(4).font = bodyFont(true)
  })

  if (sortedMonths.length === 0) {
    const row = ws5.addRow(['No data yet', 0, 0, 0, POTENTIAL, 0])
    styleDataRow(row, 6, false)
    ;[2,3,4,5].forEach(c => { row.getCell(c).numFmt = '#,##0'; row.getCell(c).alignment = center })
    row.getCell(6).numFmt = '0.0%'
  }

  // Totals row
  const grandTotal = monthTotal.boarding + monthTotal.rental
  const mTotRow = ws5.addRow(['TOTAL', monthTotal.boarding, monthTotal.rental, grandTotal, POTENTIAL * Math.max(sortedMonths.length, 1), grandTotal / (POTENTIAL * Math.max(sortedMonths.length, 1))])
  mTotRow.height = 20
  for (let c = 1; c <= 6; c++) {
    const cell = mTotRow.getCell(c)
    cell.font   = hdrFont()
    cell.fill   = fillSolid(P.dark)
    cell.border = thinBorder()
    cell.alignment = center
  }
  ;[2,3,4,5].forEach(c => mTotRow.getCell(c).numFmt = '#,##0')
  mTotRow.getCell(6).numFmt = '0.0%'

  // ── Freeze panes & tab colors ──────────────────────────────────────────────
  ws1.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]
  ws2.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]
  ws3.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]
  ws4.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]
  ws5.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }]

  ws1.tabColor = { argb: 'FF' + P.accent }
  ws2.tabColor = { argb: 'FF' + P.subhdr }
  ws3.tabColor = { argb: 'FF' + P.green }
  ws4.tabColor = { argb: 'FF' + P.amber }
  ws5.tabColor = { argb: 'FF' + P.red }

  // ── Write and download ─────────────────────────────────────────────────────
  const buf      = await wb.xlsx.writeBuffer()
  const blob     = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const filename = `8thStreet_RMS_Report_${new Date().toISOString().slice(0,10)}.xlsx`
  saveAs(blob, filename)
}
