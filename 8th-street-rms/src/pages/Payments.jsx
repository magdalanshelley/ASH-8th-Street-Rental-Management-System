import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'

const emptyPayment = {
  tenant_id: '',
  amount_paid: '',
  payment_date: '',
  payment_method: 'Cash',
  payment_status: 'Paid',
  remaining_balance: '0'
}

function Payments() {
  const [payments, setPayments] = useState([])
  const [tenants, setTenants] = useState([])
  const [formData, setFormData] = useState(emptyPayment)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchPayments()
    fetchTenants()
  }, [])

  async function fetchPayments() {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .order('id')

    setPayments(data || [])
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
    setFormData(emptyPayment)
    setIsModalOpen(true)
  }

  function openEditModal(payment) {
    setEditingId(payment.id)
    setFormData({
      tenant_id: payment.tenant_id || '',
      amount_paid: payment.amount_paid || '',
      payment_date: payment.payment_date || '',
      payment_method: payment.payment_method || 'Cash',
      payment_status: payment.payment_status || 'Paid',
      remaining_balance: payment.remaining_balance ?? '0'
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
      amount_paid: Number(formData.amount_paid),
      payment_date: formData.payment_date,
      payment_method: formData.payment_method,
      payment_status: formData.payment_status,
      remaining_balance: Number(formData.remaining_balance || 0)
    }

    const { error } = editingId
      ? await supabase.from('payments').update(payload).eq('id', editingId)
      : await supabase.from('payments').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    closeModal()
    fetchPayments()
  }

  function toggleSelectAll(event) {
    setSelectedIds(event.target.checked ? filteredPayments.map((payment) => payment.id) : [])
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    )
  }

  async function deletePayment(id) {
    const confirmDelete = window.confirm('Are you sure you want to delete this payment?')
    if (!confirmDelete) return

    const { error } = await supabase.from('payments').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    fetchPayments()
  }

  async function deleteSelectedPayments() {
    if (selectedIds.length === 0) return

    const confirmDelete = window.confirm(`Delete ${selectedIds.length} selected payment(s)?`)
    if (!confirmDelete) return

    const { error } = await supabase.from('payments').delete().in('id', selectedIds)

    if (error) {
      alert(error.message)
      return
    }

    setSelectedIds([])
    fetchPayments()
  }

  function findTenant(tenantId) {
    return tenants.find((tenant) => String(tenant.id) === String(tenantId))
  }

  const filteredPayments = payments.filter((payment) => {
    const tenant = findTenant(payment.tenant_id)
    const query = searchTerm.toLowerCase()

    return (
      String(tenant?.full_name || payment.tenant_id || '').toLowerCase().includes(query) ||
      String(payment.amount_paid || '').toLowerCase().includes(query) ||
      String(payment.payment_date || '').toLowerCase().includes(query) ||
      String(payment.payment_method || '').toLowerCase().includes(query) ||
      String(payment.payment_status || '').toLowerCase().includes(query)
    )
  })

  const allSelected = filteredPayments.length > 0 && filteredPayments.every((payment) => selectedIds.includes(payment.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Payments Management</h1>
          <p className="page-kicker">Record and adjust payment entries without cluttering the table view.</p>
        </div>

        <button className="btn-add" type="button" onClick={openAddModal}>
          + Add Payment
        </button>
      </div>

      <div className="table-card">
        {selectedIds.length > 0 && (
          <div className="bulk-toolbar">
            <span>{selectedIds.length} selected</span>
            <button className="action-btn btn-delete" type="button" onClick={deleteSelectedPayments}>
              Delete Selected
            </button>
          </div>
        )}

        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all payments" />
                </th>
                <th>Tenant</th>
                <th>Amount Paid</th>
                <th>Payment Date</th>
                <th>Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="select-column">
                    <input type="checkbox" checked={selectedIds.includes(payment.id)} onChange={(event) => toggleSelected(payment.id, event.target.checked)} aria-label={`Select payment ${payment.id}`} />
                  </td>
                  <td>{findTenant(payment.tenant_id)?.full_name || payment.tenant_id}</td>
                  <td>PHP {payment.amount_paid}</td>
                  <td>{payment.payment_date}</td>
                  <td>{payment.payment_method}</td>
                  <td>
                    <span className={`status-badge status-${String(payment.payment_status || '').toLowerCase()}`}>
                      {payment.payment_status}
                    </span>
                  </td>
                  <td>
                    <div className="action-group">
                      <button className="action-btn btn-edit" type="button" onClick={() => openEditModal(payment)}>
                        Edit
                      </button>
                      <button className="action-btn btn-delete" type="button" onClick={() => deletePayment(payment.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredPayments.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="7">No payments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingId ? 'Edit Payment' : 'Add Payment'}
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
              <span className="form-label">Amount Paid</span>
              <input className="form-input" name="amount_paid" type="number" min="0" value={formData.amount_paid} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Payment Date</span>
              <input className="form-input" name="payment_date" type="date" value={formData.payment_date} onChange={handleChange} required />
            </label>

            <label className="form-group">
              <span className="form-label">Payment Method</span>
              <select className="form-input" name="payment_method" value={formData.payment_method} onChange={handleChange}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Payment Status</span>
              <select className="form-input" name="payment_status" value={formData.payment_status} onChange={handleChange}>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Partial">Partial</option>
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Remaining Balance</span>
              <input className="form-input" name="remaining_balance" type="number" min="0" value={formData.remaining_balance} onChange={handleChange} />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" type="button" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" type="submit">Save Payment</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Payments