import { useState, useEffect } from 'react';
import { BarChart3, Cpu, Image, Video, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import api from '../config/axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';

interface UsageRecord {
  timestamp: string;
  type: 'text-to-text' | 'text-to-image' | 'text-to-video';
  model: string;
  promptPreview: string;
  success: boolean;
  durationMs?: number;
}

interface BreakdownItem {
  type: string;
  count: number;
  percentage: number;
}

interface AdminStats {
  overview: { total: number; textToText: number; textToImage: number; textToVideo: number };
  breakdown: BreakdownItem[];
  successRate: { successful: number; failed: number; rate: number };
  avgResponseTime: { textToText: number; textToImage: number; textToVideo: number; overall: number };
  recentHistory: UsageRecord[];
}

const AdminPage = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/stats');
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const handleRefresh = () => { setRefreshing(true); fetchStats(); };

  const getTypeIcon = (type: string) => {
    if (type.includes('text')) return <Cpu className="w-4 h-4" />;
    if (type.includes('image')) return <Image className="w-4 h-4" />;
    return <Video className="w-4 h-4" />;
  };

  const formatDuration = (ms?: number) => !ms ? '-' : ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`;
  const formatTime = (ts: string) => new Date(ts).toLocaleString();

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">LLM Usage Statistics</p>
            </div>
          </div>
          <button 
            onClick={handleRefresh} 
            disabled={refreshing} 
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Requests', value: stats?.overview.total, icon: BarChart3, color: 'blue', bgColor: 'bg-blue-100', textColor: 'text-blue-600' },
            { label: 'Text-to-Text', value: stats?.overview.textToText, icon: Cpu, color: 'blue', bgColor: 'bg-blue-100', textColor: 'text-blue-600' },
            { label: 'Text-to-Image', value: stats?.overview.textToImage, icon: Image, color: 'purple', bgColor: 'bg-purple-100', textColor: 'text-purple-600' },
            { label: 'Text-to-Video', value: stats?.overview.textToVideo, icon: Video, color: 'orange', bgColor: 'bg-orange-100', textColor: 'text-orange-600' }
          ].map(({ label, value, icon: Icon, color, bgColor, textColor }) => (
            <div key={label} className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2.5 ${bgColor} rounded-lg`}>
                  <Icon className={`w-5 h-5 ${textColor}`} />
                </div>
                <span className="text-gray-700 text-sm font-medium">{label}</span>
              </div>
              <div className={`text-3xl font-bold ${textColor}`}>{value || 0}</div>
            </div>
          ))}
        </div>

        {/* Breakdown & Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Usage Breakdown</h3>
            {stats?.breakdown.map((item) => (
              <div key={item.type} className="mb-5 last:mb-0">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-800 font-medium">{item.type}</span>
                  <span className="text-gray-600 text-sm font-medium">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full transition-all ${
                      item.type.includes('Text') ? 'bg-blue-600' : 
                      item.type.includes('Image') ? 'bg-purple-600' : 
                      'bg-orange-600'
                    }`} 
                    style={{ width: `${item.percentage}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Performance Metrics</h3>
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-gray-700 font-medium">Success Rate</span>
                <span className={`font-bold ${(stats?.successRate.rate||0)>=90?'text-green-600':'text-yellow-600'}`}>
                  {stats?.successRate.rate||0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="h-3 rounded-full bg-green-600 transition-all" 
                  style={{ width: `${stats?.successRate.rate||0}%` }} 
                />
              </div>
              <div className="flex justify-between mt-3 text-sm">
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4"/>
                  {stats?.successRate.successful||0} successful
                </span>
                <span className="text-red-600 font-medium flex items-center gap-1">
                  <XCircle className="w-4 h-4"/>
                  {stats?.successRate.failed||0} failed
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gray-600"/>
              <span className="text-gray-700 font-semibold">Average Response Time</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Text-to-Text', stats?.avgResponseTime.textToText, 'text-blue-600'],
                ['Text-to-Image', stats?.avgResponseTime.textToImage, 'text-purple-600'],
                ['Text-to-Video', stats?.avgResponseTime.textToVideo, 'text-orange-600'],
                ['Overall', stats?.avgResponseTime.overall, 'text-green-600']
              ].map(([label, val, textClass]) => (
                <div key={label as string} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 font-medium">{label as string}</div>
                  <div className={`text-lg font-bold ${textClass}`}>{formatDuration(val as number)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div className="bg-white rounded-lg p-6 shadow-md">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent API Calls</h3>
          {stats?.recentHistory?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-700 border-b-2 border-gray-200">
                    <th className="pb-3 font-semibold">Time</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Model</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentHistory.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 text-sm text-gray-700">{formatTime(r.timestamp)}</td>
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          r.type==='text-to-text'
                            ?'bg-blue-100 text-blue-700'
                            :r.type==='text-to-image'
                            ?'bg-purple-100 text-purple-700'
                            :'bg-orange-100 text-orange-700'
                        }`}>
                          {getTypeIcon(r.type)}
                          {r.type}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-gray-600 font-mono">{r.model}</td>
                      <td className="py-4">
                        {r.success ? (
                          <span className="text-green-600 text-sm font-semibold flex items-center gap-1">
                            <CheckCircle className="w-4 h-4"/>
                            Success
                          </span>
                        ) : (
                          <span className="text-red-600 text-sm font-semibold flex items-center gap-1">
                            <XCircle className="w-4 h-4"/>
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-sm text-gray-700 font-medium">{formatDuration(r.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400"/>
              <p className="text-gray-600">No API calls recorded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

