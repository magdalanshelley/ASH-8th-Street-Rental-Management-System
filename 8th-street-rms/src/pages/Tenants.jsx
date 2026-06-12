import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import { TENANT_STATUSES, ensureDefaultUnits, formatCurrency, formatUnitLabel } from '../utils/rentalUnits'
import { summarizeTenantMonth, statusClass } from '../utils/rmsBusiness'
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
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [payments, setPayments] = useState([])
  const [formData, setFormData] = useState(emptyTenant)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchTenants()
    fetchRooms()
    fetchPayments()

    const handleRefresh = () => {
      fetchTenants()
      fetchRooms()
      fetchPayments()
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
    try {
      const data = await ensureDefaultUnits(supabase)
      setRooms(data || [])
    } catch (error) {
      console.error(error)
    }
  }

  async function fetchPayments() {
    const { data, error } = await supabase
      .from('payments')
      .select('*')

    if (error) {
      console.error(error)
      return
    }

    setPayments(data || [])
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
    const previousTenant = editingId ? tenants.find((tenant) => tenant.id === editingId) : null

    const assignedRoomId = formData.assigned_room_id
      ? Number(formData.assigned_room_id)
      : (previousTenant?.assigned_room_id || null)

    const payload = {
      full_name: formData.full_name,
      contact_number: formData.contact_number,
      address: formData.address,
      valid_id: formData.valid_id,
      assigned_room_id: assignedRoomId,
      check_in_date: formData.check_in_date || null,
      contract_duration: formData.contract_duration || null,
      status: formData.status
    }

    const { error } = editingId
      ? await supabase.from('tenants').update(payload).eq('id', editingId)
      : await supabase.from('tenants').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    // If a room was assigned, mark it Occupied
    if (assignedRoomId && !editingId) {
      await supabase.from('rooms').update({ status: 'Occupied' }).eq('id', assignedRoomId)
    }

    // If editing and room changed, update old and new room statuses
    if (editingId && previousTenant?.assigned_room_id !== assignedRoomId) {
      if (previousTenant?.assigned_room_id) {
        await supabase.from('rooms').update({ status: 'Available' }).eq('id', previousTenant.assigned_room_id)
      }
      if (assignedRoomId) {
        await supabase.from('rooms').update({ status: 'Occupied' }).eq('id', assignedRoomId)
      }
    }

    if (payload.status === 'Moved Out' && previousTenant?.assigned_room_id) {
      await supabase.from('rooms').update({ status: 'Available' }).eq('id', previousTenant.assigned_room_id)
    }

    closeModal()
    await fetchTenants()
    await fetchRooms()
    await fetchPayments()
    dispatchRmsRefresh()
    alert('Tenant saved successfully.')
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

  function findAssignedUnit(unitId) {
    return rooms.find((room) => String(room.id) === String(unitId))
  }

  // Only show Available rooms in the dropdown (plus current tenant's room when editing)
  const availableRooms = rooms.filter((room) => {
    if (editingId) {
      const currentTenant = tenants.find((t) => t.id === editingId)
      return room.status === 'Available' || String(room.id) === String(currentTenant?.assigned_room_id)
    }
    return room.status === 'Available'
  })

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

  async function moveOutTenant(tenant) {
    const confirmMoveOut = window.confirm(`Move out ${tenant.full_name}? The assigned unit will become Available.`)
    if (!confirmMoveOut) return

    const { error } = await supabase
      .from('tenants')
      .update({ status: 'Moved Out' })
      .eq('id', tenant.id)

    if (error) {
      alert(error.message)
      return
    }

    if (tenant.assigned_room_id) {
      await supabase.from('rooms').update({ status: 'Available' }).eq('id', tenant.assigned_room_id)
    }

    await fetchTenants()
    await fetchRooms()
    dispatchRmsRefresh()
  }

  const allSelected = filteredTenants.length > 0 && filteredTenants.every((tenant) => selectedIds.includes(tenant.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Tenants Management</h1>
          <p className="page-kicker">Keep tenant profiles, assigned units, and contracts organized.</p>
        </div>

        <div className="action-group">
          <button className="btn-add" type="button" onClick={openAddModal}>
            Add Tenant
          </button>
          <button className="btn-secondary" type="button" onClick={() => navigate('/reservations')}>
            Convert Reservation
          </button>
        </div>
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
                <th>Tenant Name</th>
                <th>Assigned Unit</th>
                <th>Monthly Rent</th>
                <th>Total Paid</th>
                <th>Outstanding Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredTenants.map((tenant) => {
                const assignedUnit = findAssignedUnit(tenant.assigned_room_id)
                const summary = summarizeTenantMonth(tenant, payments, rooms)

                return (
                  <tr key={tenant.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(tenant.id)} onChange={(event) => toggleSelected(tenant.id, event.target.checked)} aria-label={`Select tenant ${tenant.full_name}`} />
                    </td>
                    <td>{tenant.full_name}</td>
                    <td>{formatUnitLabel(assignedUnit)}</td>
                    <td>{formatCurrency(summary.monthlyRent)}</td>
                    <td>{formatCurrency(summary.paymentsMade)}</td>
                    <td>{formatCurrency(summary.outstandingBalance)}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(tenant.status)}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="action-btn btn-view" type="button" onClick={() => navigate(`/tenant-account/${tenant.id}`)}>
                          View Account
                        </button>
                        <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(tenant)}>
                          Edit
                        </button>
                        {tenant.status === 'Active' && (
                          <button className="action-btn btn-delete" type="button" onClick={() => moveOutTenant(tenant)}>
                            Move Out
                          </button>
                        )}
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
                <option value="">-- No Unit Assigned --</option>
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {formatUnitLabel(room)}
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
                {TENANT_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
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