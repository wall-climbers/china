import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import GeneratedPostsPage from './pages/GeneratedPostsPage';
import CheckoutPage from './pages/CheckoutPage';
import CreativeStudioPage from './pages/CreativeStudioPage';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          } />
          <Route path="/products" element={
            <PrivateRoute>
              <ProductsPage />
            </PrivateRoute>
          } />
          <Route path="/posts" element={
            <PrivateRoute>
              <GeneratedPostsPage />
            </PrivateRoute>
          } />
          <Route path="/creative/:productId" element={
            <PrivateRoute>
              <CreativeStudioPage />
            </PrivateRoute>
          } />
          <Route path="/checkout/:sessionId" element={<CheckoutPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

