import React, { useState, useCallback } from 'react';
import GlobePage from './pages/GlobePage';
import CityDetail from './pages/CityDetail';
import CityAdminPanel from './components/admin/CityAdminPanel';

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
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
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
  );
}
