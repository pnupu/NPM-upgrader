import React from 'react';
import { Link, useHistory, withRouter, RouteComponentProps } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NavInner: React.FC<RouteComponentProps> = ({ location }) => {
  const history = useHistory();
  const { isAuthenticated, login, logout } = useAuth();

  return (
    <nav style={{ display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid #ddd' }}>
      <Link to="/">Home</Link>
      <Link to="/new">New</Link>
      <Link to="/old">Old → Redirects</Link>
      <Link to="/dashboard">Dashboard (Protected)</Link>
      <Link to="/login">Login</Link>

      <button onClick={() => history.push('/new')}>Go to New</button>
      <button onClick={() => history.goBack()}>Go Back</button>

      {isAuthenticated ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Login (mock)</button>
      )}

      {/* v5 withRouter pattern: shows current pathname from injected props */}
      <span style={{ marginLeft: 'auto', color: '#666' }}>Path: {location.pathname}</span>
    </nav>
  );
};

const Nav = withRouter(NavInner);
export default Nav;


