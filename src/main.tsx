import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

import App from './App.tsx';
import BrandNavigator from './components/BrandNavigator.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { resolveRootView } from './services/navigation-routes';
import './index.css';

function RootRouter() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    hash: window.location.hash,
  }));

  useEffect(() => {
    const handleLocationChange = () => {
      setLocationState({
        pathname: window.location.pathname,
        hash: window.location.hash,
      });
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const rootView = resolveRootView(locationState.pathname, locationState.hash);
  console.log('[routing] Resolved root view:', {
    rootView,
    pathname: locationState.pathname,
    hash: locationState.hash,
  });

  if (rootView === 'privacy-policy') {
    return <PrivacyPolicy />;
  }

  const showBrandNavigator = rootView === 'brand-navigator';

  return (
    <>
      <div style={{ display: showBrandNavigator ? 'block' : 'none' }}>
        <BrandNavigator />
      </div>
      <div style={{ display: showBrandNavigator ? 'none' : 'block' }}>
        <App />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootRouter />
    </ErrorBoundary>
  </StrictMode>,
);
