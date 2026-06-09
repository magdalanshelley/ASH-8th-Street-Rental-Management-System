import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import {
  EIGHTH_STREET_UNITS,
  UNIT_STATUSES,
  UNIT_TYPES,
  formatCurrency,
  getDefaultUnit,
  getUnitTypeLabel
} from '../utils/rentalUnits'
import { dispatchRmsRefresh, RMS_REFRESH_EVENT } from '../utils/rmsEvents'

const emptyRoom = {
  room_number: '',
  room_type: 'Single Room',
  monthly_rent: '',
  status: 'Available'
}

function Rooms() {
  const [rooms, setRooms] = useState([])
  const [formData, setFormData] = useState(emptyRoom)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchRooms()

    const handleRefresh = () => {
      fetchRooms()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

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
    const defaultUnit = name === 'room_number' ? getDefaultUnit(value) : null

    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(defaultUnit
        ? {
            room_type: defaultUnit.room_type,
            monthly_rent: String(defaultUnit.monthly_rent)
          }
        : {})
    }))
  }

  function openAddModal() {
    setEditingId(null)
    setFormData(emptyRoom)
    setIsModalOpen(true)
  }

  function openEditModal(room) {
    setEditingId(room.id)
    setFormData({
      room_number: room.room_number || '',
      room_type: getUnitTypeLabel(room.room_type),
      monthly_rent: room.monthly_rent || '',
      status: room.status || 'Available'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  async function approveReservationsOnOccupied(roomId) {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'Approved' })
      .eq('room_id', roomId)

    if (error) {
      console.error('Failed to approve reservations for occupied unit:', error)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const payload = {
      room_number: formData.room_number,
      room_type: formData.room_type,
      monthly_rent: Number(formData.monthly_rent),
      status: formData.status
    }

    const originalRoom = editingId ? rooms.find((room) => room.id === editingId) : null
    const shouldApproveReservations = editingId && originalRoom && originalRoom.status !== payload.status && payload.status === 'Occupied'

    const response = editingId
      ? await supabase.from('rooms').update(payload).eq('id', editingId).select().single()
      : await supabase.from('rooms').insert([payload]).select().single()

    if (response.error) {
      alert(response.error.message)
      return
    }

    const updatedRoom = response.data

    if (shouldApproveReservations) {
      await approveReservationsOnOccupied(editingId)
    }

    setRooms((currentRooms) => {
      if (editingId) {
        return currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room))
      }
      return [...currentRooms, updatedRoom]
    })

    closeModal()
    await fetchRooms()
    dispatchRmsRefresh()
    alert('Rental unit saved successfully.')
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredRooms.map((room) => room.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  async function deleteRoom(id) {
    const confirmDelete = window.confirm('Are you sure you want to delete this rental unit?')
    if (!confirmDelete) return

    const { error } = await supabase.from('rooms').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    dispatchRmsRefresh()

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    fetchRooms()
  }

  async function deleteSelectedRooms() {
    if (selectedIds.length === 0) return

    const confirmDelete = window.confirm(`Delete ${selectedIds.length} selected rental unit(s)?`)
    if (!confirmDelete) return

    const { error } = await supabase.from('rooms').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    setSelectedIds([])
    await fetchRooms()
    dispatchRmsRefresh()
  }

  const filteredRooms = rooms.filter((room) => {
    const query = searchTerm.toLowerCase()

    return (
      String(room.room_number || '').toLowerCase().includes(query) ||
      String(room.room_type || '').toLowerCase().includes(query) ||
      String(room.status || '').toLowerCase().includes(query)
    )
  })

  const allSelected = filteredRooms.length > 0 && filteredRooms.every((room) => selectedIds.includes(room.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Rental Units Management</h1>
          <p className="page-kicker">Manage boarding house rooms and rental spaces for 8TH Street.</p>
        </div>

        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Rental Unit
        </button>
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelectedRooms}>
              Delete Selected
            </button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search rental units..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all rental units" />
                </th>
                <th>Unit Number</th>
                <th>Unit Type</th>
                <th>Monthly Rent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredRooms.map((room) => {
                const status = room.status || 'Available'
                return (
                  <tr key={room.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(room.id)} onChange={(event) => toggleSelected(room.id, event.target.checked)} aria-label={`Select unit ${room.room_number}`} />
                    </td>
                    <td>{room.room_number}</td>
                    <td>{getUnitTypeLabel(room.room_type)}</td>
                    <td>{formatCurrency(room.monthly_rent)}</td>
                    <td>
                      <span className={`status-badge status-${String(status).toLowerCase()}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(room)}>
                          Edit
                        </button>
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteRoom(room.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredRooms.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="6">No rental units found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? 'Edit Rental Unit' : 'Add Rental Unit'}
        onClose={closeModal}
      >
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Unit Number</span>
              <input className="form-input" name="room_number" list="unit-number-options" value={formData.room_number} onChange={handleChange} required />
              <datalist id="unit-number-options">
                {EIGHTH_STREET_UNITS.map((unit) => (
                  <option key={unit.room_number} value={unit.room_number} />
                ))}
              </datalist>
            </label>

            <label className="form-group">
              <span className="form-label">Unit Type</span>
              <select className="form-input" name="room_type" value={formData.room_type} onChange={handleChange}>
                {UNIT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Monthly Rent</span>
              <input className="form-input" name="monthly_rent" type="number" min="0" value={formData.monthly_rent} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                {UNIT_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Rental Unit</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Rooms
