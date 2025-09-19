import React from 'react';
import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Nav from './components/Nav';
import Home from './pages/Home';
import NewPage from './pages/New';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
export const AppRoutes: React.FC = () => {
  return (
    <Switch>
      <Route exact path="/" component={Home} />
      <Route exact path="/new" component={NewPage} />
      {/* v5 Redirect pattern */}
      <Redirect from="/old" to="/new" />

      {/* Removed render-prop example for stability */}

      <Route exact path="/dashboard" component={Dashboard} />
      <Route exact path="/login" component={Login} />
    </Switch>
  );
};
export const AppShell: React.FC = () => {
  return (
    <AuthProvider>
      <Nav />
      <AppRoutes />
    </AuthProvider>
  );
};
const App: React.FC = () => {
  return (
    <Router>
      <AppShell />
    </Router>
  );
};
export default App;
