import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Link, Package, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface CatalogProvider {
  id: string;
  name: string;
  type: string;
}

interface CatalogStatus {
  connected: boolean;
  catalog: CatalogProvider | null;
}

const DashboardPage = () => {
  const { user, refreshUser } = useAuth();
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(null);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState({ products: 0, posts: 0 });

  useEffect(() => {
    fetchCatalogStatus();
    fetchProviders();
    fetchStats();
  }, []);

  const fetchCatalogStatus = async () => {
    try {
      const response = await axios.get('/api/catalog/status', { withCredentials: true });
      setCatalogStatus(response.data);
    } catch (error) {
      console.error('Error fetching catalog status:', error);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await axios.get('/api/catalog/providers', { withCredentials: true });
      setProviders(response.data.providers);
    } catch (error) {
      console.error('Error fetching providers:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const [productsRes, postsRes] = await Promise.all([
        axios.get('/api/products', { withCredentials: true }),
        axios.get('/api/ai/posts', { withCredentials: true })
      ]);
      setStats({
        products: productsRes.data.products.length,
        posts: postsRes.data.posts.length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleConnectCatalog = async (catalogId: string) => {
    const loadingToast = toast.loading('Connecting to catalog...');
    try {
      await axios.post('/api/catalog/connect', { catalogId }, { withCredentials: true });
      await refreshUser();
      await fetchCatalogStatus();
      toast.success('Catalog connected successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error connecting catalog:', error);
      toast.error('Failed to connect catalog', { id: loadingToast });
    }
  };

  const handleSyncProducts = async () => {
    setSyncing(true);
    const loadingToast = toast.loading('Syncing products...');
    try {
      const response = await axios.post('/api/catalog/sync', {}, { withCredentials: true });
      toast.success(`Successfully synced ${response.data.count} products!`, { id: loadingToast });
      fetchStats();
    } catch (error) {
      console.error('Error syncing products:', error);
      toast.error('Failed to sync products', { id: loadingToast });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectCatalog = async () => {
    if (!confirm('Are you sure you want to disconnect your catalog? This will not delete your synced products.')) {
      return;
    }

    const loadingToast = toast.loading('Disconnecting catalog...');
    try {
      await axios.post('/api/catalog/disconnect', {}, { withCredentials: true });
      await refreshUser();
      await fetchCatalogStatus();
      toast.success('Catalog disconnected successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error disconnecting catalog:', error);
      toast.error('Failed to disconnect catalog', { id: loadingToast });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<Package className="h-8 w-8" />}
            title="Products"
            value={stats.products}
            color="blue"
          />
          <StatCard
            icon={<FileText className="h-8 w-8" />}
            title="Generated Posts"
            value={stats.posts}
            color="green"
          />
          <StatCard
            icon={catalogStatus?.connected ? <CheckCircle className="h-8 w-8" /> : <AlertCircle className="h-8 w-8" />}
            title="Catalog Status"
            value={catalogStatus?.connected ? 'Connected' : 'Not Connected'}
            color={catalogStatus?.connected ? 'green' : 'yellow'}
          />
        </div>

        {/* Catalog Connection */}
        {!catalogStatus?.connected ? (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Connect Your Catalog</h2>
            <p className="text-gray-600 mb-6">
              Choose a catalog provider to sync your products
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleConnectCatalog(provider.id)}
                  className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <h3 className="font-semibold text-gray-900">{provider.name}</h3>
                  <p className="text-sm text-gray-500">{provider.type}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Catalog Connected</h2>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-600">
                  Connected to: <span className="font-semibold">{catalogStatus.catalog?.name}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Type: {catalogStatus.catalog?.type}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSyncProducts}
                  disabled={syncing}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {syncing ? 'Syncing...' : 'Sync Products'}
                </button>
                <button
                  onClick={handleDisconnectCatalog}
                  className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Disconnect
                </button>
              </div>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500">
                💡 <strong>Note:</strong> Disconnecting will not delete your existing synced products. You can reconnect anytime.
              </p>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="/products"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <Package className="h-6 w-6 text-blue-600 mr-3" />
              <div>
                <h3 className="font-semibold text-gray-900">Manage Products</h3>
                <p className="text-sm text-gray-500">View and manage your product catalog</p>
              </div>
            </a>
            <a
              href="/posts"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <FileText className="h-6 w-6 text-green-600 mr-3" />
              <div>
                <h3 className="font-semibold text-gray-900">Generated Posts</h3>
                <p className="text-sm text-gray-500">View and share AI-generated content</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, title, value, color }: { icon: React.ReactNode; title: string; value: number | string; color: string }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50'
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className={`inline-flex p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]} mb-4`}>
        {icon}
      </div>
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
};

export default DashboardPage;

