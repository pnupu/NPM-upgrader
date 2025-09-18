import React from 'react';
import { Route, Navigate, RouteProps, RouteComponentProps } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
type ProtectedRouteProps = RouteProps & {
    component: React.ComponentType<any>;
};
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ component: Component, ...rest }) => {
    const { isAuthenticated } = useAuth();
    return (<Route {...rest}/>);
};
export default ProtectedRoute;
