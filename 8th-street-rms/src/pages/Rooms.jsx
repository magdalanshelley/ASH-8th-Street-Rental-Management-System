import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import {
  EIGHTH_STREET_UNITS,
  UNIT_TYPES,
  ensureDefaultUnits,
  formatCurrency,
  getDefaultUnit,
  getUnitTypeLabel
} from '../utils/rentalUnits'
import { statusClass } from '../utils/rmsBusiness'
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

  async function syncRoomStatuses() {
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('assigned_room_id, status')

    if (tenantError) { console.error(tenantError); return }

    const { data: currentRooms, error: roomError } = await supabase
      .from('rooms')
      .select('*')

    if (roomError) { console.error(roomError); return }

    const occupiedRoomIds = new Set(
      (tenants || [])
        .filter((t) => t.status === 'Active' && t.assigned_room_id)
        .map((t) => String(t.assigned_room_id))
    )

    const updates = (currentRooms || []).filter((room) => {
      const shouldBeOccupied = occupiedRoomIds.has(String(room.id))
      if (shouldBeOccupied && room.status !== 'Occupied') return true
      if (!shouldBeOccupied && room.status === 'Occupied') return true
      return false
    })

    for (const room of updates) {
      const shouldBeOccupied = occupiedRoomIds.has(String(room.id))
      await supabase
        .from('rooms')
        .update({ status: shouldBeOccupied ? 'Occupied' : 'Available' })
        .eq('id', room.id)
    }
  }

  async function fetchRooms() {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('room_number')

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error(error)
    }
  }

  async function initializeRooms() {
    try {
      await ensureDefaultUnits(supabase)
      await syncRoomStatuses()
      await fetchRooms()
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    initializeRooms()

    const handleRefresh = async () => {
      await syncRoomStatuses()
      await fetchRooms()
    }
    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    const defaultUnit = name === 'room_number' ? getDefaultUnit(value) : null

    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(defaultUnit
        ? { room_type: defaultUnit.room_type, monthly_rent: String(defaultUnit.monthly_rent) }
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

  function closeModal() { setIsModalOpen(false) }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!editingId) {
      const existingRoom = rooms.find(
        (room) =>
          String(room.room_number).trim().toLowerCase() ===
          String(formData.room_number).trim().toLowerCase()
      )
      if (existingRoom) {
        alert('A unit with this number already exists.')
        return
      }
    }

    const originalRoom = editingId ? rooms.find((room) => room.id === editingId) : null

    const payload = {
      room_number: formData.room_number,
      room_type: formData.room_type,
      monthly_rent: Number(formData.monthly_rent),
      status: originalRoom?.status || 'Available'
    }

    const response = editingId
      ? await supabase.from('rooms').update(payload).eq('id', editingId).select().single()
      : await supabase.from('rooms').insert([payload]).select().single()

    if (response.error) {
      alert(response.error.message)
      return
    }

    const updatedRoom = response.data

    setRooms((currentRooms) => {
      if (editingId) {
        return currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room))
      }
      return [...currentRooms, updatedRoom]
    })

    closeModal()
    await syncRoomStatuses()
    await fetchRooms()
    dispatchRmsRefresh()
    alert(editingId ? 'Unit updated.' : 'Unit added successfully.')
  }

  async function deleteRoom(id) {
    const room = rooms.find((r) => r.id === id)
    if (room?.status === 'Occupied') {
      alert('Cannot delete an occupied unit. Move out the tenant first.')
      return
    }
    if (!window.confirm(`Delete unit ${room?.room_number}? This cannot be undone.`)) return

    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) { alert(error.message); return }

    setSelectedIds((cur) => cur.filter((x) => x !== id))
    await fetchRooms()
    dispatchRmsRefresh()
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return
    const occupied = rooms.filter((r) => selectedIds.includes(r.id) && r.status === 'Occupied')
    if (occupied.length > 0) {
      alert(`${occupied.length} unit(s) are occupied and cannot be deleted.`)
      return
    }
    if (!window.confirm(`Delete ${selectedIds.length} unit(s)?`)) return

    const { error } = await supabase.from('rooms').delete().in('id', selectedIds)
    if (error) { alert(error.message); return }

    setSelectedIds([])
    await fetchRooms()
    dispatchRmsRefresh()
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredRooms.map((room) => room.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
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

  const availableCount = rooms.filter((r) => r.status === 'Available').length
  const occupiedCount = rooms.filter((r) => r.status === 'Occupied').length

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Rental Units Management</h1>
          <p className="page-kicker">Manage boarding house rooms and rental spaces for 8TH Street.</p>
        </div>

        <div className="action-group">
          <button className="btn-add" type="button" onClick={openAddModal}>
            + Add Unit
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={async () => { await syncRoomStatuses(); await fetchRooms() }}
          >
            Refresh Units
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Units', value: rooms.length, color: 'var(--primary)' },
          { label: 'Occupied', value: occupiedCount, color: 'var(--danger)' },
          { label: 'Available', value: availableCount, color: 'var(--success)' }
        ].map(({ label, value, color }) => (
          <div key={label} className="table-card" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{label}</span>
            <strong style={{ fontSize: '1.5rem', color }}>{value}</strong>
          </div>
        ))}
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelected}>
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
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(room.id)}
                        onChange={(event) => toggleSelected(room.id, event.target.checked)}
                        aria-label={`Select unit ${room.room_number}`}
                      />
                    </td>
                    <td>{room.room_number}</td>
                    <td>{getUnitTypeLabel(room.room_type)}</td>
                    <td>{formatCurrency(room.monthly_rent)}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(room)}>
                          Edit
                        </button>
                        <button
                          className="action-btn btn-delete"
                          type="button"
                          onClick={() => deleteRoom(room.id)}
                          disabled={room.status === 'Occupied'}
                          title={room.status === 'Occupied' ? 'Move out tenant first' : 'Delete unit'}
                        >
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

      <Modal isOpen={isModalOpen} title={editingId ? 'Edit Rental Unit' : 'Add Rental Unit'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Unit Number</span>
              <input
                className="form-input"
                name="room_number"
                list="unit-number-options"
                value={formData.room_number}
                onChange={handleChange}
                required
                placeholder="e.g. Room 9, RS-3"
              />
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
              <input
                className="form-input"
                name="monthly_rent"
                type="number"
                min="0"
                value={formData.monthly_rent}
                onChange={handleChange}
                required
              />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <input
                className="form-input"
                value={formData.status || 'Available'}
                disabled
                title="Status is automatically managed based on tenant assignments."
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">
              {editingId ? 'Save Changes' : 'Add Unit'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Rooms