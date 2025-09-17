import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const Login: React.FC = () => {
  const { login } = useAuth();
  const history = useHistory();
  const location = useLocation<{ from?: { pathname: string } }>();

  const handleLogin = () => {
    login();
    const from = location.state?.from?.pathname || '/';
    history.push(from);
  };

  return (
    <main style={{ padding: 16 }}>
      <h1>Login</h1>
      <button onClick={handleLogin}>Sign in</button>
    </main>
  );
};

export default Login;


