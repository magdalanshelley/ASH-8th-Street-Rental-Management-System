import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import DashboardCard from '../components/DashboardCard'
import {
  FaHome,
  FaDoorOpen,
  FaUsers,
  FaCalendarAlt,
  FaMoneyBillWave
} from 'react-icons/fa'
import { RMS_REFRESH_EVENT } from '../utils/rmsEvents'
import { motion } from 'framer-motion'
import './Dashboard.css'

function Dashboard() {
  const [totalUnits, setTotalUnits] = useState(0)
  const [availableUnits, setAvailableUnits] = useState(0)
  const [occupiedUnits, setOccupiedUnits] = useState(0)
  const [reservedUnits, setReservedUnits] = useState(0)
  const [totalTenants, setTotalTenants] = useState(0)
  const [monthlyIncome, setMonthlyIncome] = useState(0)

  useEffect(() => {
    loadDashboard()

    const handleRefresh = () => {
      loadDashboard()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
  }, [])

  async function loadDashboard() {
    const { data: rooms } = await supabase.from('rooms').select('*')
    const { data: tenants } = await supabase.from('tenants').select('*')
    const { data: payments } = await supabase.from('payments').select('*')

    setTotalUnits(rooms?.length || 0)
    setAvailableUnits(rooms?.filter((r) => r.status === 'Available').length || 0)
    setOccupiedUnits(rooms?.filter((r) => r.status === 'Occupied').length || 0)
    setReservedUnits(rooms?.filter((r) => r.status === 'Reserved').length || 0)
    setTotalTenants(tenants?.length || 0)

    const income = payments?.reduce((sum, p) => sum + Number(p.amount_paid || p.amount || 0), 0) || 0
    setMonthlyIncome(income)
  }

  const cards = [
    { title: 'Total Rental Units', value: totalUnits, icon: FaDoorOpen, accent: 'var(--primary)' },
    { title: 'Available Units', value: availableUnits, icon: FaHome, accent: 'var(--info)' },
    { title: 'Occupied Units', value: occupiedUnits, icon: FaUsers, accent: 'var(--danger)' },
    { title: 'Reserved Units', value: reservedUnits, icon: FaCalendarAlt, accent: 'var(--warning)' },
    { title: 'Total Tenants', value: totalTenants, icon: FaUsers, accent: 'var(--success)' },
    { title: 'Monthly Income', value: `PHP ${monthlyIncome.toLocaleString()}`, icon: FaMoneyBillWave, accent: 'var(--primary)' }
  ]

  return (
    <motion.div className="dashboard-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="dash-header">
        <h2>Dashboard</h2>
        <p className="sub">Welcome to 8th Street Rental Management System</p>
      </header>

      <section className="cards-grid">
        {cards.map((c) => (
          <DashboardCard key={c.title} icon={c.icon} title={c.title} value={c.value} accent={c.accent} />
        ))}
      </section>

      <section className="lower-grid">
        <div className="card white-card recent-activity">
          <h3>Recent Activity</h3>
          <div className="activity-list">
            <div className="activity-item">No recent activity available</div>
          </div>
        </div>

        <div className="card white-card quick-summary">
          <h3>Quick Summary</h3>
          <ul>
            <li>Occupancy: {totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0}%</li>
            <li>Monthly Income: PHP {monthlyIncome.toLocaleString()}</li>
            <li>Reserved Units: {reservedUnits}</li>
          </ul>
        </div>
      </section>
    </motion.div>
  )
}

export default Dashboard
