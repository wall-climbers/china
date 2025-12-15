import { useState, useEffect } from 'react';
import { BarChart3, Cpu, Image, Video, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import api from '../config/axios';
import toast from 'react-hot-toast';

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg"><BarChart3 className="w-6 h-6 text-emerald-400" /></div>
            <div><h1 className="text-2xl font-bold">Admin Dashboard</h1><p className="text-gray-400 text-sm">LLM Usage Stats</p></div>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh
            </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total', value: stats?.overview.total, icon: BarChart3, color: 'emerald' },
            { label: 'Text-to-Text', value: stats?.overview.textToText, icon: Cpu, color: 'blue' },
            { label: 'Text-to-Image', value: stats?.overview.textToImage, icon: Image, color: 'purple' },
            { label: 'Text-to-Video', value: stats?.overview.textToVideo, icon: Video, color: 'orange' }
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 bg-${color}-500/20 rounded-lg`}><Icon className={`w-5 h-5 text-${color}-400`} /></div>
                <span className="text-gray-400 text-sm">{label}</span>
              </div>
              <div className={`text-3xl font-bold text-${color}-400`}>{value || 0}</div>
            </div>
          ))}
        </div>

        {/* Breakdown & Performance */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-6">Usage Breakdown</h3>
            {stats?.breakdown.map((item) => (
              <div key={item.type} className="mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-300">{item.type}</span>
                  <span className="text-gray-400">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className={`h-2 rounded-full ${item.type.includes('Text') ? 'bg-blue-500' : item.type.includes('Image') ? 'bg-purple-500' : 'bg-orange-500'}`} style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-6">Performance</h3>
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">Success Rate</span>
                <span className={`font-semibold ${(stats?.successRate.rate||0)>=90?'text-emerald-400':'text-yellow-400'}`}>{stats?.successRate.rate||0}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3">
                <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${stats?.successRate.rate||0}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-emerald-400"><CheckCircle className="w-3 h-3 inline mr-1"/>{stats?.successRate.successful||0}</span>
                <span className="text-red-400"><XCircle className="w-3 h-3 inline mr-1"/>{stats?.successRate.failed||0}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-gray-400"/><span className="text-gray-400">Avg Response Time</span></div>
            <div className="grid grid-cols-2 gap-3">
              {[['Text-to-Text', stats?.avgResponseTime.textToText, 'blue'],['Text-to-Image', stats?.avgResponseTime.textToImage, 'purple'],['Text-to-Video', stats?.avgResponseTime.textToVideo, 'orange'],['Overall', stats?.avgResponseTime.overall, 'emerald']].map(([label, val, c]) => (
                <div key={label as string} className="bg-gray-800 rounded-lg p-3">
                  <div className="text-sm text-gray-400 mb-1">{label as string}</div>
                  <div className={`text-lg font-semibold text-${c}-400`}>{formatDuration(val as number)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold mb-6">Recent API Calls</h3>
          {stats?.recentHistory?.length ? (
            <table className="w-full">
              <thead><tr className="text-left text-gray-400 border-b border-gray-800">
                <th className="pb-3">Time</th><th className="pb-3">Type</th><th className="pb-3">Model</th><th className="pb-3">Status</th><th className="pb-3">Duration</th>
              </tr></thead>
              <tbody>
                {stats.recentHistory.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 text-sm text-gray-300">{formatTime(r.timestamp)}</td>
                    <td className="py-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${r.type==='text-to-text'?'bg-blue-500/20 text-blue-400':r.type==='text-to-image'?'bg-purple-500/20 text-purple-400':'bg-orange-500/20 text-orange-400'}`}>{getTypeIcon(r.type)}{r.type}</span></td>
                    <td className="py-3 text-sm text-gray-400 font-mono">{r.model}</td>
                    <td className="py-3">{r.success?<span className="text-emerald-400 text-sm"><CheckCircle className="w-3 h-3 inline mr-1"/>OK</span>:<span className="text-red-400 text-sm"><XCircle className="w-3 h-3 inline mr-1"/>Fail</span>}</td>
                    <td className="py-3 text-sm text-gray-400">{formatDuration(r.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-500"><BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50"/><p>No API calls yet</p></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

