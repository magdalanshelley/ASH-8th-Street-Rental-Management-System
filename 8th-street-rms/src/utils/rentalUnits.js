export const UNIT_TYPES = ['Single Room', 'Rental Space']
export const UNIT_STATUSES = ['Available', 'Reserved', 'Occupied']
export const RESERVATION_STATUSES = ['Pending', 'Approved', 'Converted', 'Cancelled']
export const TENANT_STATUSES = ['Active', 'Moved Out']

export const EIGHTH_STREET_UNITS = [
  { room_number: '1', room_type: 'Single Room', monthly_rent: 4000 },
  { room_number: '2', room_type: 'Single Room', monthly_rent: 6000 },
  { room_number: '3', room_type: 'Single Room', monthly_rent: 8000 },
  { room_number: '4', room_type: 'Single Room', monthly_rent: 8000 },
  { room_number: 'RS-1', room_type: 'Rental Space', monthly_rent: 8000 },
  { room_number: 'RS-2', room_type: 'Rental Space', monthly_rent: 8000 },
  { room_number: 'RS-3', room_type: 'Rental Space', monthly_rent: 8000 },
  { room_number: 'RS-4', room_type: 'Rental Space', monthly_rent: 8000 }
]

export function getDefaultUnit(unitNumber) {
  return EIGHTH_STREET_UNITS.find(
    (unit) => unit.room_number.toLowerCase() === String(unitNumber || '').toLowerCase()
  )
}

export function formatCurrency(value) {
  const amount = Number(value || 0)

  return amount.toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

export function formatUnitLabel(unit) {
  if (!unit) return '-'

  return `${unit.room_number} (${unit.room_type})`
}

export function getUnitTypeLabel(type) {
  if (type === 'Single') return 'Single Room'
  if (type === 'Double') return 'Single Room'

  return type || 'Single Room'
}

export function getUnitStatusFromReservation(status) {
  if (status === 'Converted') return 'Occupied'
  if (status === 'Cancelled') return 'Available'

  return 'Reserved'
}

export function normalizeUnitType(type) {
  if (type === 'boarding' || type === 'single' || type === 'Single') return 'Single Room'
  if (type === 'rental_space' || type === 'commercial') return 'Rental Space'

  return type || 'Single Room'
}

export function sortUnits(units) {
  const unitOrder = new Map(EIGHTH_STREET_UNITS.map((unit, index) => [unit.room_number, index]))

  return [...units].sort((a, b) => {
    const aOrder = unitOrder.has(a.room_number) ? unitOrder.get(a.room_number) : 999
    const bOrder = unitOrder.has(b.room_number) ? unitOrder.get(b.room_number) : 999

    if (aOrder !== bOrder) return aOrder - bOrder
    return String(a.room_number || '').localeCompare(String(b.room_number || ''))
  })
}

export async function ensureDefaultUnits(supabase) {
  const { data, error } = await supabase.from('rooms').select('*').order('room_number')
  if (error) throw error

  const existing = data || []
  const existingNumbers = new Set(existing.map((unit) => String(unit.room_number || '').toLowerCase()))
  const missingUnits = EIGHTH_STREET_UNITS
    .filter((unit) => !existingNumbers.has(unit.room_number.toLowerCase()))
    .map((unit) => ({ ...unit, status: 'Available' }))

  if (missingUnits.length > 0) {
    const { error: insertError } = await supabase.from('rooms').insert(missingUnits)
    if (insertError) throw insertError

    const { data: refreshed, error: refreshError } = await supabase.from('rooms').select('*').order('room_number')
    if (refreshError) throw refreshError
    return sortUnits(refreshed || [])
  }

  return sortUnits(existing)
}