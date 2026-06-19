import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import {
  RESERVATION_STATUSES,
  ensureDefaultUnits,
  formatUnitLabel,
  getUnitStatusFromReservation
} from '../utils/rentalUnits'
import { statusClass } from '../utils/rmsBusiness'
import { dispatchRmsRefresh, RMS_REFRESH_EVENT } from '../utils/rmsEvents'

const emptyReservation = {
  applicant_name: '',
  room_id: '',
  reservation_date: '',
  move_in_date: '',
  status: 'Pending'
}

function Reservations() {
  const [reservations, setReservations] = useState([])
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [formData, setFormData] = useState(emptyReservation)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  async function refreshAll() {
    await Promise.all([fetchReservations(), fetchTenants(), fetchRooms()])
  }

  useEffect(() => {
    refreshAll()

    const handleRefresh = () => {
      refreshAll()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

  async function fetchReservations() {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('reservation_date', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setReservations(data || [])
  }

  async function fetchTenants() {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('full_name')

    if (error) {
      console.error(error)
      return
    }

    setTenants(data || [])
  }

  async function fetchRooms() {
    try {
      const data = await ensureDefaultUnits(supabase)
      setRooms(data || [])
    } catch (error) {
      console.error(error)
    }
  }

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  function openAddModal() {
    setEditingId(null)
    setFormData(emptyReservation)
    setIsModalOpen(true)
  }

  function openEditModal(reservation) {
    setEditingId(reservation.id)
    setFormData({
      applicant_name: reservation.applicant_name || reservation.tenant_name || reservation.guest_name || '',
      room_id: reservation.room_id || '',
      reservation_date: reservation.reservation_date || '',
      move_in_date: reservation.move_in_date || '',
      status: reservation.status || 'Pending'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  async function updateUnitStatus(roomId, status) {
    if (!roomId) return

    const { error } = await supabase
      .from('rooms')
      .update({ status })
      .eq('id', roomId)

    if (error) throw error
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const previousReservation = editingId ? reservations.find((reservation) => reservation.id === editingId) : null
    const previousRoomId = previousReservation?.room_id
    const newRoomId = formData.room_id || null
    const currentUnit = rooms.find((room) => String(room.id) === String(newRoomId))
    const isCurrentUnit = previousRoomId && String(previousRoomId) === String(newRoomId)

    if (!isCurrentUnit && currentUnit?.status !== 'Available') {
      alert('Only available units can be reserved.')
      return
    }

    const duplicateReservation = reservations.find((reservation) => (
      reservation.id !== editingId &&
      String(reservation.room_id) === String(newRoomId) &&
      !['Cancelled', 'Converted'].includes(reservation.status)
    ))

    if (duplicateReservation) {
      alert('This unit already has an active reservation.')
      return
    }

    const payload = {
      applicant_name: formData.applicant_name,
      room_id: newRoomId,
      reservation_date: formData.reservation_date,
      move_in_date: formData.move_in_date,
      status: formData.status
    }

    const { error } = editingId
      ? await supabase.from('reservations').update(payload).eq('id', editingId)
      : await supabase.from('reservations').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    try {
      if (previousRoomId && previousRoomId !== newRoomId) {
        await updateUnitStatus(previousRoomId, 'Available')
      }

      await updateUnitStatus(newRoomId, getUnitStatusFromReservation(formData.status))
    } catch (statusError) {
      alert(statusError.message)
      return
    }

    closeModal()
    await refreshAll()
    dispatchRmsRefresh()
    alert('Reservation saved successfully.')
  }

  async function approveReservation(reservation) {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'Approved' })
      .eq('id', reservation.id)

    if (error) {
      alert(error.message)
      return
    }

    await updateUnitStatus(reservation.room_id, 'Reserved')
    await refreshAll()
    dispatchRmsRefresh()
  }

  async function convertReservation(reservation) {
    const activeTenant = tenants.find((tenant) => (
      tenant.status === 'Active' &&
      String(tenant.assigned_room_id) === String(reservation.room_id)
    ))

    if (activeTenant) {
      alert('This unit already has an active tenant.')
      return
    }

    // FIX: capture the newly created tenant's id so we can link it
    // back to the reservation via tenant_id.
    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        full_name: reservation.applicant_name || reservation.tenant_name || reservation.guest_name,
        assigned_room_id: reservation.room_id,
        check_in_date: reservation.move_in_date,
        status: 'Active',
        reservation_id: reservation.id
      }])
      .select()
      .single()

    if (tenantError) {
      alert(tenantError.message)
      return
    }

    // FIX: set tenant_id on the reservation now that a tenant exists.
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({ status: 'Converted', tenant_id: newTenant.id })
      .eq('id', reservation.id)

    if (reservationError) {
      alert(reservationError.message)
      return
    }

    await updateUnitStatus(reservation.room_id, 'Occupied')
    await refreshAll()
    dispatchRmsRefresh()
  }

  async function deleteReservation(id) {
    const confirmDelete = window.confirm('Are you sure you want to delete this reservation?')
    if (!confirmDelete) return

    const reservation = reservations.find((currentReservation) => currentReservation.id === id)
    const { error } = await supabase.from('reservations').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    if (reservation?.room_id && reservation.status !== 'Converted') {
      await updateUnitStatus(reservation.room_id, 'Available')
    }

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    await refreshAll()
    dispatchRmsRefresh()
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredReservations.map((reservation) => reservation.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  async function deleteSelectedReservations() {
    if (selectedIds.length === 0) return

    const confirmDelete = window.confirm(`Delete ${selectedIds.length} selected reservation(s)?`)
    if (!confirmDelete) return

    const releasedUnitIds = reservations
      .filter((reservation) => selectedIds.includes(reservation.id) && reservation.room_id && reservation.status !== 'Converted')
      .map((reservation) => reservation.room_id)

    const { error } = await supabase.from('reservations').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    if (releasedUnitIds.length > 0) {
      await supabase.from('rooms').update({ status: 'Available' }).in('id', releasedUnitIds)
    }

    setSelectedIds([])
    await refreshAll()
    dispatchRmsRefresh()
  }

  function findUnit(unitId) {
    return rooms.find((room) => String(room.id) === String(unitId))
  }

  const filteredReservations = reservations.filter((reservation) => {
    const unit = findUnit(reservation.room_id)
    const query = searchTerm.toLowerCase()

    return (
      String(reservation.applicant_name || reservation.tenant_name || reservation.guest_name || '').toLowerCase().includes(query) ||
      formatUnitLabel(unit).toLowerCase().includes(query) ||
      String(reservation.reservation_date || '').toLowerCase().includes(query) ||
      String(reservation.move_in_date || '').toLowerCase().includes(query) ||
      String(reservation.status || '').toLowerCase().includes(query)
    )
  })

  const assignableUnits = rooms.filter((room) => {
    const isAvailable = room.status === 'Available'
    const isCurrentUnit = editingId && String(room.id) === String(formData.room_id)

    return isAvailable || isCurrentUnit
  })

  const allSelected = filteredReservations.length > 0 && filteredReservations.every((reservation) => selectedIds.includes(reservation.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Reservations Management</h1>
          <p className="page-kicker">Reserve available units and convert approved reservations into active tenants.</p>
        </div>

        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Reservation
        </button>
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelectedReservations}>
              Delete Selected
            </button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search reservations..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all reservations" />
                </th>
                <th>Reservation ID</th>
                <th>Applicant Name</th>
                <th>Reserved Unit</th>
                <th>Reservation Date</th>
                <th>Move-In Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredReservations.map((reservation) => {
                const unit = findUnit(reservation.room_id)
                const canApprove = reservation.status === 'Pending'
                const canConvert = ['Pending', 'Approved'].includes(reservation.status)

                return (
                  <tr key={reservation.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(reservation.id)} onChange={(event) => toggleSelected(reservation.id, event.target.checked)} aria-label={`Select reservation ${reservation.id}`} />
                    </td>
                    <td>{reservation.id}</td>
                    <td>{reservation.applicant_name || reservation.tenant_name || reservation.guest_name || '-'}</td>
                    <td>{formatUnitLabel(unit)}</td>
                    <td>{reservation.reservation_date}</td>
                    <td>{reservation.move_in_date}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(reservation.status)}`}>
                        {reservation.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        {canApprove && <button className="action-btn btn-edit" type="button" onClick={() => approveReservation(reservation)}>Approve</button>}
                        {canConvert && <button className="action-btn btn-view" type="button" onClick={() => convertReservation(reservation)}>Convert</button>}
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(reservation)}>Edit</button>
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteReservation(reservation.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredReservations.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="8">No reservations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? 'Edit Reservation' : 'Add Reservation'}
        onClose={closeModal}
      >
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Applicant Name</span>
              <input className="form-input" name="applicant_name" value={formData.applicant_name} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Reserved Unit</span>
              <select className="form-input" name="room_id" value={formData.room_id} onChange={handleChange} required>
                <option value="">Select Available Unit</option>
                {assignableUnits.map((room) => (
                  <option key={room.id} value={room.id}>
                    {formatUnitLabel(room)}
                    {room.status !== 'Available' ? ` (${room.status})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Reservation Date</span>
              <input className="form-input" name="reservation_date" type="date" value={formData.reservation_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Move-In Date</span>
              <input className="form-input" name="move_in_date" type="date" value={formData.move_in_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                {RESERVATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Reservation</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Reservations