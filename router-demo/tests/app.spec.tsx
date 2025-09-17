import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import App, { AppShell, AppRoutes } from '../src/App';
import { AuthProvider } from '../src/auth/AuthContext';

const renderWithRouter = (ui: React.ReactElement, initialEntries: string[] = ['/']) => {
  const history = createMemoryHistory({ initialEntries });
  return {
    history,
    ...render(<Router history={history}>{ui}</Router>)
  };
};

test('navigates / shows Home', () => {
  renderWithRouter(<AppShell />);
  expect(screen.getByRole('heading', { name: /home/i })).toBeInTheDocument();
});

test('navigates /old redirects to /new', async () => {
  const { history } = renderWithRouter(<AppRoutes />, ['/old']);
  // Redirect should land on /new
  expect(history.location.pathname).toBe('/new');
  expect(screen.getByRole('heading', { name: /new/i })).toBeInTheDocument();
});

test('protected route unauthenticated redirects to /login', () => {
  const history = createMemoryHistory({ initialEntries: ['/dashboard'] });
  render(
    <Router history={history}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
  expect(history.location.pathname).toBe('/login');
  expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
});

test('imperative nav button pushes /new', async () => {
  const user = userEvent.setup();
  const history = createMemoryHistory({ initialEntries: ['/'] });
  render(
    <Router history={history}>
      <AppShell />
    </Router>
  );

  await user.click(screen.getByRole('button', { name: /go to new/i }));
  expect(history.location.pathname).toBe('/new');
});


