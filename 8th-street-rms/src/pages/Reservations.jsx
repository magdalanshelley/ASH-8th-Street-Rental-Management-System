import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import { formatUnitLabel, getUnitStatusFromReservation } from '../utils/rentalUnits'
import { dispatchRmsRefresh, RMS_REFRESH_EVENT } from '../utils/rmsEvents'

const emptyReservation = {
  tenant_id: '',
  room_id: '',
  reservation_date: '',
  move_in_date: '',
  status: 'Reserved'
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

  useEffect(() => {
    fetchReservations()
    fetchTenants()
    fetchRooms()

    const handleRefresh = () => {
      fetchReservations()
      fetchTenants()
      fetchRooms()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

  async function fetchReservations() {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('id')

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
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number')

    if (error) {
      console.error(error)
      return
    }

    setRooms(data || [])
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
      tenant_id: reservation.tenant_id || '',
      room_id: reservation.room_id || '',
      reservation_date: reservation.reservation_date || '',
      move_in_date: reservation.move_in_date || '',
      status: reservation.status || 'Reserved'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const payload = {
      tenant_id: formData.tenant_id,
      room_id: formData.room_id,
      reservation_date: formData.reservation_date,
      move_in_date: formData.move_in_date,
      status: formData.status
    }

    const previousReservation = editingId ? reservations.find((reservation) => reservation.id === editingId) : null
    const previousRoomId = previousReservation?.room_id
    const newRoomId = formData.room_id || null

    const { error } = editingId
      ? await supabase.from('reservations').update(payload).eq('id', editingId)
      : await supabase.from('reservations').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    if (previousRoomId && previousRoomId !== newRoomId) {
      await supabase.from('rooms').update({ status: 'Available' }).eq('id', previousRoomId)
    }

    if (newRoomId) {
      await supabase
        .from('rooms')
        .update({ status: getUnitStatusFromReservation(formData.status) })
        .eq('id', newRoomId)

      if (formData.status === 'Occupied') {
        await supabase.from('reservations').update({ status: 'Approved' }).eq('room_id', newRoomId)
      }
    }

    closeModal()
    await fetchRooms()
    await fetchReservations()
    dispatchRmsRefresh()
    alert('Reservation saved successfully.')
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

    if (reservation?.room_id) {
      await supabase.from('rooms').update({ status: 'Available' }).eq('id', reservation.room_id)
    }

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    await fetchRooms()
    await fetchReservations()
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

    const { error } = await supabase.from('reservations').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    const releasedUnitIds = reservations
      .filter((reservation) => selectedIds.includes(reservation.id) && reservation.room_id)
      .map((reservation) => reservation.room_id)

    if (releasedUnitIds.length > 0) {
      await supabase.from('rooms').update({ status: 'Available' }).in('id', releasedUnitIds)
    }

    setSelectedIds([])
    await fetchRooms()
    await fetchReservations()
    dispatchRmsRefresh()
  }

  function findTenant(tenantId) {
    return tenants.find((tenant) => String(tenant.id) === String(tenantId))
  }

  function findUnit(unitId) {
    return rooms.find((room) => String(room.id) === String(unitId))
  }

  const filteredReservations = reservations.filter((reservation) => {
    const tenant = findTenant(reservation.tenant_id)
    const unit = findUnit(reservation.room_id)
    const query = searchTerm.toLowerCase()

    return (
      String(tenant?.full_name || reservation.tenant_id || '').toLowerCase().includes(query) ||
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
          <p className="page-kicker">Reserve rental units and move them through the 8TH Street status workflow.</p>
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
                <th>Tenant</th>
                <th>Rental Unit</th>
                <th>Reservation Date</th>
                <th>Move In Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredReservations.map((reservation) => {
                const tenant = findTenant(reservation.tenant_id)
                const unit = findUnit(reservation.room_id)

                return (
                  <tr key={reservation.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(reservation.id)} onChange={(event) => toggleSelected(reservation.id, event.target.checked)} aria-label={`Select reservation ${reservation.id}`} />
                    </td>
                    <td>{tenant?.full_name || reservation.tenant_id}</td>
                    <td>{formatUnitLabel(unit)}</td>
                    <td>{reservation.reservation_date}</td>
                    <td>{reservation.move_in_date}</td>
                    <td>
                      <span className={`status-badge status-${String(reservation.status || '').toLowerCase()}`}>
                        {reservation.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(reservation)}>Edit</button>
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteReservation(reservation.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredReservations.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="7">No reservations found.</td>
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
              <span className="form-label">Tenant</span>
              <select className="form-input" name="tenant_id" value={formData.tenant_id} onChange={handleChange} required>
                <option value="">Select Tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Rental Unit</span>
              <select className="form-input" name="room_id" value={formData.room_id} onChange={handleChange} required>
                <option value="">Select Rental Unit</option>
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
              <span className="form-label">Move In Date</span>
              <input className="form-input" name="move_in_date" type="date" value={formData.move_in_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                <option value="Reserved">Reserved</option>
                <option value="Occupied">Occupied</option>
                <option value="Cancelled">Cancelled</option>
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
