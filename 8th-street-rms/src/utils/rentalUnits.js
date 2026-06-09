export const UNIT_TYPES = ['Single Room', 'Rental Space']
export const UNIT_STATUSES = ['Available', 'Reserved', 'Occupied', 'Maintenance']

export const EIGHTH_STREET_UNITS = [
  { room_number: 'Room 1', room_type: 'Single Room', monthly_rent: 4000 },
  { room_number: 'Room 2', room_type: 'Single Room', monthly_rent: 8000 },
  { room_number: 'Room 3', room_type: 'Single Room', monthly_rent: 8000 },
  { room_number: 'Room 4', room_type: 'Single Room', monthly_rent: 8000 },
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
  return `PHP ${Number(value || 0).toLocaleString()}`
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
  if (status === 'Occupied') return 'Occupied'
  if (status === 'Cancelled') return 'Available'

  return 'Reserved'
}
