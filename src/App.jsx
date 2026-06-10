import React, { useState, useCallback, Component } from 'react';
import GlobePage from './pages/GlobePage';
import CityDetail from './pages/CityDetail';
import CityAdminPanel from './components/admin/CityAdminPanel';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', background: '#111', padding: 40, fontFamily: 'monospace', height: '100vh' }}>
          <h1>React Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{this.state.error?.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#999' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [page, setPage] = useState('globe'); // 'globe' | 'city' | 'admin'
  const [selectedCity, setSelectedCity] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const goToCity = useCallback((cityName) => {
    setSelectedCity(cityName);
    setPage('city');
  }, []);

  const goBackToGlobe = useCallback(() => {
    setSelectedCity(null);
    setPage('globe');
  }, []);

  const openAdmin = useCallback(() => {
    setShowAdmin(true);
  }, []);

  const closeAdmin = useCallback(() => {
    setShowAdmin(false);
  }, []);

  return (
    <ErrorBoundary>
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {page === 'globe' && (
        <GlobePage
          goToCity={goToCity}
          openAdmin={openAdmin}
        />
      )}

      {page === 'city' && selectedCity && (
        <CityDetail
          cityName={selectedCity}
          goBack={goBackToGlobe}
        />
      )}

      {showAdmin && (
        <CityAdminPanel onBack={closeAdmin} />
      )}
    </div>
    </ErrorBoundary>
  );
}
