import { formatCurrency, formatUnitLabel } from './rentalUnits'

export function getPaymentStatus(amountPaid, monthlyRent) {
  const amount = Number(amountPaid || 0)
  const rent = Number(monthlyRent || 0)

  if (amount <= 0) return 'Pending'
  if (rent > 0 && amount >= rent) return 'Paid'
  return 'Partial'
}

export function getPaymentMonth(paymentDate = new Date()) {
  const date = paymentDate instanceof Date ? paymentDate : new Date(paymentDate)
  if (Number.isNaN(date.getTime())) return ''

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getCurrentMonthKey() {
  return getPaymentMonth(new Date())
}

export function getTenantRoom(tenant, rooms = []) {
  return rooms.find((room) => String(room.id) === String(tenant?.assigned_room_id))
}

export function getTenantMonthlyRent(tenant, rooms = []) {
  const room = getTenantRoom(tenant, rooms)
  return Number(room?.monthly_rent || tenant?.monthly_rent || 0)
}

export function getPaymentAmount(payment) {
  return Number(payment?.amount_paid || payment?.amount || 0)
}

export function getPaymentStatusValue(payment, tenant, rooms = []) {
  return payment?.payment_status || payment?.status || getPaymentStatus(
    getPaymentAmount(payment),
    getTenantMonthlyRent(tenant, rooms)
  )
}

export function getTenantPaymentsForMonth(tenantId, payments = [], monthKey = getCurrentMonthKey()) {
  return payments.filter((payment) => (
    String(payment.tenant_id) === String(tenantId) &&
    getPaymentMonth(payment.payment_date) === monthKey
  ))
}

export function summarizeTenantMonth(tenant, payments = [], rooms = [], monthKey = getCurrentMonthKey()) {
  const monthlyRent = getTenantMonthlyRent(tenant, rooms)
  const monthPayments = getTenantPaymentsForMonth(tenant?.id, payments, monthKey)
  const totalPaid = monthPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0)
  const outstandingBalance = Math.max(monthlyRent - totalPaid, 0)

  return {
    monthKey,
    monthlyRent,
    paymentsMade: totalPaid,
    outstandingBalance,
    status: getPaymentStatus(totalPaid, monthlyRent)
  }
}

export function buildTenantLedger(tenant, payments = [], rooms = []) {
  const monthlyRent = getTenantMonthlyRent(tenant, rooms)
  const monthKeys = new Set([getCurrentMonthKey()])

  payments
    .filter((payment) => String(payment.tenant_id) === String(tenant?.id))
    .forEach((payment) => {
      const monthKey = getPaymentMonth(payment.payment_date)
      if (monthKey) monthKeys.add(monthKey)
    })

  return [...monthKeys]
    .sort()
    .reverse()
    .map((monthKey) => {
      const monthPayments = getTenantPaymentsForMonth(tenant?.id, payments, monthKey)
      const paymentsMade = monthPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0)
      const outstandingBalance = Math.max(monthlyRent - paymentsMade, 0)

      return {
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        rentDue: monthlyRent,
        paymentsMade,
        outstandingBalance,
        status: getPaymentStatus(paymentsMade, monthlyRent)
      }
    })
}

export function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number)
  if (!year || !month) return '-'

  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric'
  })
}

export function buildTenantOptionLabel(tenant, rooms = []) {
  const room = getTenantRoom(tenant, rooms)
  return `${tenant.full_name} - ${formatUnitLabel(room)} - ${formatCurrency(getTenantMonthlyRent(tenant, rooms))}`
}

export function getPaymentAmountOptions(monthlyRent) {
  const rent = Number(monthlyRent || 0)
  const fixed = [rent, 6000, 4000, 2000]
    .filter((amount, index, amounts) => amount > 0 && amounts.indexOf(amount) === index)
    .sort((a, b) => b - a)

  return fixed.map((amount) => ({
    value: String(amount),
    label: amount === rent ? `${formatCurrency(amount)} (Full Payment)` : formatCurrency(amount)
  }))
}

export function statusClass(status) {
  return String(status || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
