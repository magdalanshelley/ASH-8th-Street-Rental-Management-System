import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { supabase } from '../supabase'
import { ensureDefaultUnits, formatCurrency } from '../utils/rentalUnits'
import {
  buildTenantOptionLabel,
  getPaymentAmountOptions,
  getPaymentStatus,
  getPaymentStatusValue,
  getTenantMonthlyRent,
  getTenantRoom,
  statusClass
} from '../utils/rmsBusiness'
import { dispatchRmsRefresh, RMS_REFRESH_EVENT } from '../utils/rmsEvents'

const emptyPayment = {
  tenant_id: '',
  amount_option: '',
  custom_amount: '',
  payment_date: '',
  payment_method: 'Cash'
}

function Payments() {
  const [payments, setPayments] = useState([])
  const [tenants, setTenants] = useState([])
  const [rooms, setRooms] = useState([])
  const [formData, setFormData] = useState(emptyPayment)
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  async function refreshAll() {
    await Promise.all([fetchPayments(), fetchTenants(), fetchRooms()])
  }

  useEffect(() => {
    refreshAll()
    const onRefresh = () => refreshAll()
    window.addEventListener(RMS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, onRefresh)
  }, [])

  async function fetchPayments() {
    const { data, error } = await supabase
      .from('payments')
      .select('*, tenants(full_name, assigned_room_id, monthly_rent)')
      .order('payment_date', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setPayments(data || [])
  }

  async function fetchTenants() {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('status', 'Active')
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
    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(name === 'tenant_id' ? { amount_option: '', custom_amount: '' } : {})
    }))
  }

  function openAddModal() {
    setEditingId(null)
    setFormData(emptyPayment)
    setIsModalOpen(true)
  }

  function openEditModal(payment) {
    const amount = String(payment.amount_paid || 0)
    setEditingId(payment.id)
    setFormData({
      tenant_id: payment.tenant_id || '',
      amount_option: amount,
      custom_amount: '',
      payment_date: payment.payment_date || '',
      payment_method: payment.payment_method || 'Cash'
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  function findTenant(tenantId) {
    return tenants.find((tenant) => String(tenant.id) === String(tenantId))
      || payments.find((payment) => String(payment.tenant_id) === String(tenantId))?.tenants
  }

  const selectedTenant = useMemo(() => findTenant(formData.tenant_id), [formData.tenant_id, tenants, payments])
  const selectedRent = getTenantMonthlyRent(selectedTenant, rooms)
  const selectedAmount = formData.amount_option === 'custom'
    ? Number(formData.custom_amount || 0)
    : Number(formData.amount_option || 0)
  const calculatedStatus = getPaymentStatus(selectedAmount, selectedRent)

  async function handleSubmit(event) {
    event.preventDefault()

    if (!formData.tenant_id) {
      alert('Select a tenant.')
      return
    }

    if (Number.isNaN(selectedAmount) || selectedAmount < 0) {
      alert('Payment amount cannot be negative.')
      return
    }

    const duplicatePayment = payments.find((payment) => (
      payment.id !== editingId &&
      String(payment.tenant_id) === String(formData.tenant_id) &&
      payment.payment_date === formData.payment_date &&
      Number(payment.amount_paid || 0) === selectedAmount
    ))

    if (duplicatePayment) {
      alert('Duplicate payment entry detected for this tenant, date, and amount.')
      return
    }

    const remainingBalance = Math.max(selectedRent - selectedAmount, 0)
    const payload = {
  tenant_id: formData.tenant_id,
  amount_paid: selectedAmount,
  payment_date: formData.payment_date,
  payment_method: formData.payment_method,
  payment_status: calculatedStatus,
  remaining_balance: remainingBalance
}

    const { error } = editingId
      ? await supabase.from('payments').update(payload).eq('id', editingId)
      : await supabase.from('payments').insert([payload])

    if (error) {
      alert(error.message)
      return
    }

    closeModal()
    await fetchPayments()
    dispatchRmsRefresh()
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
    await fetchPayments()
    dispatchRmsRefresh()
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
    await fetchPayments()
    dispatchRmsRefresh()
  }

  const filteredPayments = payments.filter((payment) => {
    const tenant = findTenant(payment.tenant_id)
    const query = searchTerm.toLowerCase()

    return (
      String(tenant?.full_name || payment.tenant_id || '').toLowerCase().includes(query) ||
      String(payment.amount_paid || '').toLowerCase().includes(query) ||
      String(payment.payment_date || '').toLowerCase().includes(query) ||
      String(payment.payment_method || '').toLowerCase().includes(query) ||
      String(getPaymentStatusValue(payment, tenant, rooms)).toLowerCase().includes(query)
    )
  })

  const allSelected = filteredPayments.length > 0 && filteredPayments.every((payment) => selectedIds.includes(payment.id))

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Payments Management</h1>
          <p className="page-kicker">Record tenant-based payments with automatic status and balance calculations.</p>
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
                <th>Assigned Unit</th>
                <th>Amount Paid</th>
                <th>Payment Date</th>
                <th>Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.map((payment) => {
                const tenant = findTenant(payment.tenant_id)
                const room = getTenantRoom(tenant, rooms)
                const status = getPaymentStatusValue(payment, tenant, rooms)

                return (
                  <tr key={payment.id}>
                    <td className="select-column">
                      <input type="checkbox" checked={selectedIds.includes(payment.id)} onChange={(event) => toggleSelected(payment.id, event.target.checked)} aria-label={`Select payment ${payment.id}`} />
                    </td>
                    <td>{tenant?.full_name || payment.tenant_id}</td>
                    <td>{room?.room_number || '-'}</td>
                    <td>{formatCurrency(payment.amount_paid)}</td>
                    <td>{payment.payment_date}</td>
                    <td>{payment.payment_method}</td>
                    <td>
                      <span className={`status-badge status-${statusClass(status)}`}>
                        {status}
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
                )
              })}

              {filteredPayments.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="8">No payments found.</td>
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
            <label className="form-group full-width">
              <span className="form-label">Tenant</span>
              <select className="form-input" name="tenant_id" value={formData.tenant_id} onChange={handleChange} required>
                <option value="">Select Tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {buildTenantOptionLabel(tenant, rooms)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">Monthly Rent</span>
              <input className="form-input" value={formatCurrency(selectedRent)} disabled />
            </label>

            <label className="form-group">
              <span className="form-label">Payment Amount</span>
              <select className="form-input" name="amount_option" value={formData.amount_option} onChange={handleChange} required>
                <option value="">Select Amount</option>
                {getPaymentAmountOptions(selectedRent).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                <option value="custom">Custom Amount</option>
              </select>
            </label>

            {formData.amount_option === 'custom' && (
              <label className="form-group">
                <span className="form-label">Custom Amount</span>
                <input className="form-input" name="custom_amount" type="number" min="0" value={formData.custom_amount} onChange={handleChange} required />
              </label>
            )}

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
              <span className="form-label">Calculated Status</span>
              <input className="form-input" value={calculatedStatus} disabled />
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
