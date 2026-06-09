import { Navigate, Outlet, useLocation } from 'react-router-dom'

function ProtectedRoute({ user, loading }) {
  const location = useLocation()

  if (loading) {
    return (
      <div className="route-loading-state">
        <p>Checking administrator session…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute
