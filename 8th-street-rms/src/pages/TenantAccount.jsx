import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Modal from '../components/Modal'
import './TenantAccount.css'

function formatCurrency(value) {
  const amount = Number(value)
  if (Number.isNaN(amount)) return '0.00'
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  })
}

function TenantAccount() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [roomLabel, setRoomLabel] = useState('-')
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [paymentForm, setPaymentForm] = useState({
    amount_paid: '',
    payment_date: '',
    payment_method: 'Cash',
    payment_status: 'Paid'
  })

  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', id)
          .single()

        if (tenantError) throw tenantError
        setTenant(tenantData)

        if (tenantData?.assigned_room_id) {
          const { data: roomData, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', tenantData.assigned_room_id)
            .single()

          if (roomError) throw roomError
          setRoomLabel(`${roomData.room_number || 'Unit'} ${roomData.building || ''}`.trim())
        } else {
          setRoomLabel('-')
        }

        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .select('*')
          .eq('tenant_id', id)
          .order('payment_date', { ascending: false })

        if (paymentError) throw paymentError
        setPayments(paymentData || [])
      } catch (fetchError) {
        console.error(fetchError)
        setError(fetchError.message || 'Unable to load tenant account.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const summary = useMemo(() => {
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0)
    return {
      totalPayments: payments.length,
      totalAmountPaid: totalAmount,
      latestPaymentDate: payments.length ? payments[0].payment_date : null
    }
  }, [payments])

  const openModal = () => {
    setSuccessMessage('')
    setPaymentForm({
      amount_paid: '',
      payment_date: '',
      payment_method: 'Cash',
      payment_status: 'Paid'
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  function handlePaymentChange(event) {
    const { name, value } = event.target
    setPaymentForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSavePayment(event) {
    event.preventDefault()
    setError('')

    if (!paymentForm.amount_paid || !paymentForm.payment_date) {
      setError('Please fill out amount and date.')
      return
    }

    setSaving(true)
    try {
      const { error: insertError } = await supabase.from('payments').insert([
        {
          tenant_id: id,
          amount_paid: Number(paymentForm.amount_paid),
          payment_date: paymentForm.payment_date,
          payment_method: paymentForm.payment_method,
          payment_status: paymentForm.payment_status,
          remaining_balance: 0
        }
      ])

      if (insertError) throw insertError
      setSuccessMessage('Payment recorded successfully.')
      closeModal()
      await reloadPayments()
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Unable to save payment.')
    } finally {
      setSaving(false)
    }
  }

  async function reloadPayments() {
    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', id)
        .order('payment_date', { ascending: false })

      if (paymentError) throw paymentError
      setPayments(paymentData || [])
    } catch (loadError) {
      console.error(loadError)
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-loading">Loading tenant account...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="page-error">{error}</div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="page-shell">
        <div className="page-error">Tenant not found.</div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-header tenant-header">
        <div>
          <h1>Tenant Account</h1>
          <p className="page-kicker">Ledger, payments and account details for {tenant.full_name}.</p>
        </div>
        <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
          Back to Tenants
        </button>
      </div>

      <div className="tenant-grid">
        <section className="tenant-card">
          <h2>Tenant Details</h2>
          <dl className="tenant-details">
            <div>
              <dt>Name</dt>
              <dd>{tenant.full_name}</dd>
            </div>
            <div>
              <dt>Contact Number</dt>
              <dd>{tenant.contact_number || '-'}</dd>
            </div>
            <div>
              <dt>Assigned Room</dt>
              <dd>{roomLabel}</dd>
            </div>
            <div>
              <dt>Check In Date</dt>
              <dd>{tenant.check_in_date || '-'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{tenant.status || 'Unknown'}</dd>
            </div>
          </dl>
        </section>

        <section className="summary-panel">
          <div className="summary-card">
            <span>Total Payments</span>
            <strong>{summary.totalPayments}</strong>
          </div>
          <div className="summary-card">
            <span>Total Amount Paid</span>
            <strong>{formatCurrency(summary.totalAmountPaid)}</strong>
          </div>
          <div className="summary-card">
            <span>Latest Payment</span>
            <strong>{summary.latestPaymentDate || 'No payments yet'}</strong>
          </div>
          <button className="btn-primary btn-block" type="button" onClick={openModal}>
            + Add Payment
          </button>
        </section>
      </div>

      <section className="payments-section">
        <div className="section-header">
          <div>
            <h2>Payment History</h2>
            <p>Recent payment activity for this tenant.</p>
          </div>
          <span>{payments.length} records</span>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Payment Date</th>
                  <th>Amount Paid</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Remaining Balance</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.payment_date || '-'}</td>
                    <td>{formatCurrency(payment.amount_paid)}</td>
                    <td>{payment.payment_method}</td>
                    <td>
                      <span className={`status-badge status-${String(payment.payment_status || '').toLowerCase()}`}>
                        {payment.payment_status}
                      </span>
                    </td>
                    <td>{payment.remaining_balance != null ? formatCurrency(payment.remaining_balance) : '-'}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td className="empty-state" colSpan="5">
                      No payments have been recorded for this tenant yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Modal isOpen={isModalOpen} title="Add Payment" onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSavePayment}>
          <div className="form-grid">
            <label className="form-group full-width">
              <span className="form-label">Amount Paid</span>
              <input
                className="form-input"
                name="amount_paid"
                type="number"
                step="0.01"
                min="0"
                value={paymentForm.amount_paid}
                onChange={handlePaymentChange}
                required
              />
            </label>

            <label className="form-group full-width">
              <span className="form-label">Payment Date</span>
              <input
                className="form-input"
                name="payment_date"
                type="date"
                value={paymentForm.payment_date}
                onChange={handlePaymentChange}
                required
              />
            </label>

            <label className="form-group full-width">
              <span className="form-label">Payment Method</span>
              <select
                className="form-input"
                name="payment_method"
                value={paymentForm.payment_method}
                onChange={handlePaymentChange}
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </label>

            <label className="form-group full-width">
              <span className="form-label">Payment Status</span>
              <select
                className="form-input"
                name="payment_status"
                value={paymentForm.payment_status}
                onChange={handlePaymentChange}
              >
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Pending">Pending</option>
              </select>
            </label>
          </div>

          {error && <div className="form-error">{error}</div>}
          {successMessage && <div className="form-success">{successMessage}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default TenantAccount
