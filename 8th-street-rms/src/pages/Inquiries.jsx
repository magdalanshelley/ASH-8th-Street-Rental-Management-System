import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'

const emptyInquiry = {
  tenant_id: '',
  message: '',
  date_submitted: '',
  status: 'Pending'
}

function Inquiries() {
  const [inquiries, setInquiries] = useState([])
  const [tenants, setTenants] = useState([])
  const [formData, setFormData] = useState(emptyInquiry)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchInquiries()
    fetchTenants()
  }, [])

  async function fetchInquiries() {
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('id')

    if (error) {
      console.error(error)
      return
    }

    setInquiries(data || [])
  }

  async function fetchTenants() {
    const { data } = await supabase
      .from('tenants')
      .select('*')

    setTenants(data || [])
  }

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  function openAddModal() {
    setEditingId(null)
    setFormData({
      ...emptyInquiry,
      date_submitted: new Date().toISOString().split('T')[0]
    })
    setIsModalOpen(true)
  }

  function openEditModal(inquiry) {
    setEditingId(inquiry.id)
    setFormData({
      tenant_id: inquiry.tenant_id || '',
      message: inquiry.message || '',
      date_submitted: inquiry.date_submitted || '',
      status: inquiry.status || 'Pending'
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
      message: formData.message,
      date_submitted: formData.date_submitted || new Date().toISOString().split('T')[0],
      status: formData.status
    }

    const { error } = editingId
      ? await supabase.from('inquiries').update(payload).eq('id', editingId)
      : await supabase.from('inquiries').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    closeModal()
    fetchInquiries()
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredInquiries.map((inquiry) => inquiry.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  async function deleteInquiry(id) {
    const confirmDelete = window.confirm('Are you sure you want to delete this inquiry?')
    if (!confirmDelete) return

    const { error } = await supabase.from('inquiries').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    fetchInquiries()
  }

  async function deleteSelectedInquiries() {
    if (selectedIds.length === 0) return

    const confirmDelete = window.confirm(`Delete ${selectedIds.length} selected inquiry(s)?`)
    if (!confirmDelete) return

    const { error } = await supabase.from('inquiries').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    setSelectedIds([])
    fetchInquiries()
  }

  function findTenant(tenantId) {
    return tenants.find((tenant) => String(tenant.id) === String(tenantId))
  }

  const filteredInquiries = inquiries.filter((inquiry) => {
    const tenant = findTenant(inquiry.tenant_id)
    const query = searchTerm.toLowerCase()

    return (
      String(tenant?.full_name || inquiry.tenant_id || '').toLowerCase().includes(query) ||
      String(inquiry.message || '').toLowerCase().includes(query) ||
      String(inquiry.date_submitted || '').toLowerCase().includes(query) ||
      String(inquiry.status || '').toLowerCase().includes(query)
    )
  })

  const allSelected = filteredInquiries.length > 0 && filteredInquiries.every((inquiry) => selectedIds.includes(inquiry.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Inquiries Management</h1>
          <p className="page-kicker">Handle tenant inquiries through a clean popup form.</p>
        </div>

        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Inquiry
        </button>
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelectedInquiries}>
              Delete Selected
            </button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search inquiries..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all inquiries" />
                </th>
                <th>Tenant</th>
                <th>Message</th>
                <th>Date Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredInquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <td className="select-column">
                    <input type="checkbox" checked={selectedIds.includes(inquiry.id)} onChange={(event) => toggleSelected(inquiry.id, event.target.checked)} aria-label={`Select inquiry ${inquiry.id}`} />
                  </td>
                  <td>{findTenant(inquiry.tenant_id)?.full_name || inquiry.tenant_id}</td>
                  <td>{inquiry.message}</td>
                  <td>{inquiry.date_submitted}</td>
                  <td>
                    <span className={`status-badge status-${String(inquiry.status || '').toLowerCase()}`}>
                      {inquiry.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-group">
                      <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(inquiry)}>
                        Edit
                      </button>
                      <button className="action-btn btn-delete" type="button" onClick={() => deleteInquiry(inquiry.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredInquiries.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="6">No inquiries found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? 'Edit Inquiry' : 'Add Inquiry'}
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
              <span className="form-label">Date Submitted</span>
              <input className="form-input" name="date_submitted" type="date" value={formData.date_submitted} onChange={handleChange} required />
            </label>

            <label className="form-group full-width">
              <span className="form-label">Inquiry Message</span>
              <textarea className="form-input" name="message" value={formData.message} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Status</span>
              <select className="form-input" name="status" value={formData.status} onChange={handleChange}>
                <option value="Pending">Pending</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Inquiry</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Inquiries
