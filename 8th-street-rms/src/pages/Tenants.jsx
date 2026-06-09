import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import { formatUnitLabel } from '../utils/rentalUnits'
import { dispatchRmsRefresh, RMS_REFRESH_EVENT } from '../utils/rmsEvents'

const emptyTenant = {
  full_name: '',
  contact_number: '',
  address: '',
  valid_id: '',
  assigned_room_id: '',
  check_in_date: '',
  contract_duration: '',
  status: 'Active'
}
function Tenants() {
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [formData, setFormData] = useState(emptyTenant)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchTenants()
    fetchRooms()

    const handleRefresh = () => {
      fetchTenants()
      fetchRooms()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

  async function fetchTenants() {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('id')

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
    setFormData(emptyTenant)
    setIsModalOpen(true)
  }

  function openEditModal(tenant) {
    setEditingId(tenant.id)
    setFormData({
      full_name: tenant.full_name || '',
      contact_number: tenant.contact_number || '',
      address: tenant.address || '',
      valid_id: tenant.valid_id || '',
      assigned_room_id: tenant.assigned_room_id || '',
      check_in_date: tenant.check_in_date || '',
      contract_duration: tenant.contract_duration || '',
      status: tenant.status || 'Active'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const payload = {
      full_name: formData.full_name,
      contact_number: formData.contact_number,
      address: formData.address,
      valid_id: formData.valid_id,
      assigned_room_id: formData.assigned_room_id || null,
      check_in_date: formData.check_in_date || null,
      contract_duration: formData.contract_duration || null,
      status: formData.status
    }

    const previousTenant = editingId ? tenants.find((tenant) => tenant.id === editingId) : null
    const previousRoomId = previousTenant?.assigned_room_id
    const newRoomId = formData.assigned_room_id || null

    const { error } = editingId
      ? await supabase.from('tenants').update(payload).eq('id', editingId)
      : await supabase.from('tenants').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    if (previousRoomId && previousRoomId !== newRoomId) {
      await supabase.from('rooms').update({ status: 'Available' }).eq('id', previousRoomId)
    }

    if (newRoomId) {
      await supabase.from('rooms').update({ status: 'Occupied' }).eq('id', newRoomId)
      await supabase.from('reservations').update({ status: 'Approved' }).eq('room_id', newRoomId)
    }

    closeModal()
    await fetchTenants()
    await fetchRooms()
    dispatchRmsRefresh()
    alert('Tenant saved successfully.')
  }

  async function deleteTenant(id) {
    const confirmDelete = window.confirm('Are you sure you want to delete this tenant?')
    if (!confirmDelete) return

    const tenant = tenants.find((currentTenant) => currentTenant.id === id)
    const { error } = await supabase.from('tenants').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    if (tenant?.assigned_room_id) {
      await supabase
        .from('rooms')
        .update({ status: 'Available' })
        .eq('id', tenant.assigned_room_id)
    }

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    await fetchTenants()
    await fetchRooms()
    dispatchRmsRefresh()
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredTenants.map((tenant) => tenant.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  async function deleteSelectedTenants() {
    if (selectedIds.length === 0) return

    const confirmDelete = window.confirm(`Delete ${selectedIds.length} selected tenant(s)?`)
    if (!confirmDelete) return

    const { error } = await supabase.from('tenants').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    const releasedUnitIds = tenants
      .filter((tenant) => selectedIds.includes(tenant.id) && tenant.assigned_room_id)
      .map((tenant) => tenant.assigned_room_id)

    if (releasedUnitIds.length > 0) {
      await supabase.from('rooms').update({ status: 'Available' }).in('id', releasedUnitIds)
    }

    setSelectedIds([])
    await fetchTenants()
    await fetchRooms()
    dispatchRmsRefresh()
  }

  const assignableRooms = rooms.filter((room) => {
    const isAvailable = room.status === 'Available'
    const isCurrentRoom = editingId && String(room.id) === String(formData.assigned_room_id)

    return isAvailable || isCurrentRoom
  })

  function findAssignedUnit(unitId) {
    return rooms.find((room) => String(room.id) === String(unitId))
  }

  const filteredTenants = tenants.filter((tenant) => {
    const assignedUnit = findAssignedUnit(tenant.assigned_room_id)
    const query = searchTerm.toLowerCase()

    return (
      String(tenant.full_name || '').toLowerCase().includes(query) ||
      String(tenant.contact_number || '').toLowerCase().includes(query) ||
      String(tenant.address || '').toLowerCase().includes(query) ||
      formatUnitLabel(assignedUnit).toLowerCase().includes(query) ||
      String(tenant.status || '').toLowerCase().includes(query)
    )
  })

  const allSelected = filteredTenants.length > 0 && filteredTenants.every((tenant) => selectedIds.includes(tenant.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Tenants Management</h1>
          <p className="page-kicker">Keep tenant profiles, assigned units, and contracts organized.</p>
        </div>

        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Tenant
        </button>
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelectedTenants}>
              Delete Selected
            </button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all tenants" />
                </th>
                <th>Name</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Assigned Unit</th>
                <th>Check In</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredTenants.map((tenant) => {
                const assignedUnit = findAssignedUnit(tenant.assigned_room_id)

                return (
                  <tr key={tenant.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(tenant.id)} onChange={(event) => toggleSelected(tenant.id, event.target.checked)} aria-label={`Select tenant ${tenant.full_name}`} />
                    </td>
                    <td>{tenant.full_name}</td>
                    <td>{tenant.contact_number}</td>
                    <td>{tenant.address}</td>
                    <td>{formatUnitLabel(assignedUnit)}</td>
                    <td>{tenant.check_in_date || '-'}</td>
                    <td>
                      <span className={`status-badge status-${String(tenant.status || '').toLowerCase()}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(tenant)}>Edit</button>
                        <button className="action-btn btn-delete" type="button" onClick={() => deleteTenant(tenant.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredTenants.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="8">No tenants found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? 'Edit Tenant' : 'Add Tenant'}
        onClose={closeModal}
      >
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-group">
              <span className="form-label">Full Name</span>
              <input className="form-input" name="full_name" value={formData.full_name} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Contact Number</span>
              <input className="form-input" name="contact_number" value={formData.contact_number} onChange={handleChange} required />
            </label>

            <label className="form-group full-width">
              <span className="form-label">Address</span>
              <input className="form-input" name="address" value={formData.address} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Valid ID</span>
              <input className="form-input" name="valid_id" value={formData.valid_id} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Assigned Unit</span>
              <select className="form-input" name="assigned_room_id" value={formData.assigned_room_id} onChange={handleChange}>
                <option value="">Select Unit</option>
                {assignableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {formatUnitLabel(room)}
                    {room.status !== 'Available' ? ` (${room.status})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Check In Date</span>
              <input className="form-input" name="check_in_date" type="date" value={formData.check_in_date} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Contract Duration (months)</span>
              <input className="form-input" name="contract_duration" type="number" min="0" value={formData.contract_duration} onChange={handleChange} />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Tenant</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Tenants
