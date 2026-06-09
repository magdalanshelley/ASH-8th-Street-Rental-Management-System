import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  FaHome,
  FaDoorOpen,
  FaUsers,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaUserCheck
} from 'react-icons/fa'
import { RMS_REFRESH_EVENT } from '../utils/rmsEvents'
import { motion } from 'framer-motion'
import './Dashboard.css'

function DashboardCard({ title, value, icon: Icon, accent }) {
  return (
    <div className="dash-card" style={{ '--card-accent': accent }}>
      <div className="card-icon">
        <Icon />
      </div>
      <div className="card-info">
        <span className="card-value">{value}</span>
        <span className="card-title">{title}</span>
      </div>
    </div>
  )
}

function Dashboard() {
  const [totalUnits, setTotalUnits] = useState(0)
  const [availableUnits, setAvailableUnits] = useState(0)
  const [occupiedUnits, setOccupiedUnits] = useState(0)
  const [reservedUnits, setReservedUnits] = useState(0)
  const [totalTenants, setTotalTenants] = useState(0)
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [recentActivity, setRecentActivity] = useState([])

  const today = new Date()

  const dateLabel = today.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  useEffect(() => {
    loadDashboard()

    const handleRefresh = () => {
      loadDashboard()
    }

    window.addEventListener(RMS_REFRESH_EVENT, handleRefresh)

    return () => {
      window.removeEventListener(RMS_REFRESH_EVENT, handleRefresh)
    }
  }, [])

  async function loadDashboard() {
    try {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')

      const { data: tenants } = await supabase
        .from('tenants')
        .select('*')

      const now = new Date()

      const monthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toISOString()

      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59
      ).toISOString()

      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .gte('payment_date', monthStart)
        .lte('payment_date', monthEnd)

      const { data: recentPayments } = await supabase
        .from('payments')
        .select(`
          *,
          tenants (
            full_name
          )
        `)
        .order('payment_date', { ascending: false })
        .limit(5)

      setTotalUnits(rooms?.length || 0)

      setAvailableUnits(
        rooms?.filter(
          (room) => room.status === 'Available'
        ).length || 0
      )

      setOccupiedUnits(
        rooms?.filter(
          (room) => room.status === 'Occupied'
        ).length || 0
      )

      setReservedUnits(
        rooms?.filter(
          (room) => room.status === 'Reserved'
        ).length || 0
      )

      setTotalTenants(tenants?.length || 0)

      const income =
        payments?.reduce(
          (sum, payment) =>
            sum +
            Number(
              payment.amount_paid ||
              payment.amount ||
              0
            ),
          0
        ) || 0

      setMonthlyIncome(income)

      setRecentActivity(recentPayments || [])
    } catch (error) {
      console.error('Dashboard Error:', error)
    }
  }

  const occupancyRate = totalUnits
    ? Math.round((occupiedUnits / totalUnits) * 100)
    : 0

  const cards = [
    {
      title: 'Total Rental Units',
      value: totalUnits,
      icon: FaDoorOpen,
      accent: 'var(--primary)'
    },
    {
      title: 'Available Units',
      value: availableUnits,
      icon: FaHome,
      accent: 'var(--info)'
    },
    {
      title: 'Occupied Units',
      value: occupiedUnits,
      icon: FaUserCheck,
      accent: 'var(--danger)'
    },
    {
      title: 'Reserved Units',
      value: reservedUnits,
      icon: FaCalendarAlt,
      accent: 'var(--warning)'
    },
    {
      title: 'Total Tenants',
      value: totalTenants,
      icon: FaUsers,
      accent: 'var(--success)'
    },
    {
      title: 'Income This Month',
      value: `PHP ${monthlyIncome.toLocaleString()}`,
      icon: FaMoneyBillWave,
      accent: '#a78bfa'
    }
  ]

  return (
    <motion.div
      className="dashboard-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="dash-header">
        <div>
          <h2>Dashboard</h2>
          <p className="sub">
            Welcome to 8th Street Rental Management System
          </p>
        </div>

        <div className="dash-header-date">
          <div>{dateLabel}</div>
        </div>
      </header>

      <section className="cards-grid">
        {cards.map((card) => (
          <DashboardCard
            key={card.title}
            {...card}
          />
        ))}
      </section>

      <section className="lower-grid">
        <div className="white-card recent-activity">
          <h3>Recent Activity</h3>

          <div className="activity-list">
            {recentActivity.length === 0 ? (
              <div className="activity-empty">
                No payments recorded yet
              </div>
            ) : (
              recentActivity.map((payment) => {
                const tenantName =
                  payment.tenants?.full_name ||
                  `Tenant #${payment.tenant_id}`

                const amount = Number(
                  payment.amount_paid ||
                  payment.amount ||
                  0
                )

                const date = payment.payment_date
                  ? new Date(
                      payment.payment_date
                    ).toLocaleDateString(
                      'en-PH',
                      {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      }
                    )
                  : 'No Date'

                return (
                  <div
                    className="activity-item"
                    key={payment.id}
                  >
                    <div className="activity-dot" />

                    <div className="activity-body">
                      <span className="activity-name">
                        {tenantName}
                      </span>

                      <span className="activity-meta">
                        Payment recorded • {date}
                      </span>
                    </div>

                    <span className="activity-amount">
                      +PHP {amount.toLocaleString()}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="white-card quick-summary">
          <h3>Quick Summary</h3>

          <ul>
            <li>
              <span>Occupancy</span>
              <span>{occupancyRate}%</span>
            </li>

            <li>
              <span>Available Units</span>
              <span>{availableUnits}</span>
            </li>

            <li>
              <span>Reserved Units</span>
              <span>{reservedUnits}</span>
            </li>

            <li>
              <span>Income This Month</span>
              <span>
                PHP {monthlyIncome.toLocaleString()}
              </span>
            </li>
          </ul>
        </div>
      </section>
    </motion.div>
  )
}

export default Dashboard