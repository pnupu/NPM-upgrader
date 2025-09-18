import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, RouteComponentProps } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Nav from './components/Nav';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import NewPage from './pages/New';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
export const AppRoutes: React.FC = () => {
    return (<Routes>
      <Route path="/" component={Home}/>
      <Route path="/new" component={NewPage}/>
      {/* v5 Redirect pattern */}
      <Navigate from="/old" to="/new"/>

      {/* v5 render prop pattern */}
      <Route path="/render-example" render={(props: RouteComponentProps) => (<div>
            Render prop works. Path: {props.location.pathname}
          </div>)}/>

      {/* Protected route using render + Redirect internally */}
      <ProtectedRoute path="/dashboard" component={Dashboard}/>
      <Route path="/login" component={Login}/>
    </Routes>);
};
export const AppShell: React.FC = () => {
    return (<AuthProvider>
      <Nav />
      <AppRoutes />
    </AuthProvider>);
};
const App: React.FC = () => {
    return (<Router>
      <AppShell />
    </Router>);
};
export default App;
