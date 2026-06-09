import { motion } from 'framer-motion'

function DashboardCard({ icon: Icon, title, value, accent }) {
  return (
    <motion.div
      className="dash-card"
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <div className="card-left">
        <div className="card-icon" style={{ background: `linear-gradient(135deg, ${accent}, var(--primary-hover))` }}>
          <Icon />
        </div>
      </div>

      <div className="card-right">
        <div className="card-value">{value}</div>
        <div className="card-title">{title}</div>
      </div>
    </motion.div>
  )
}

export default DashboardCard
