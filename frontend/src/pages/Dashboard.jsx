import { 
  ShoppingBag, 
  IndianRupee, 
  Users, 
  UtensilsCrossed, 
  Clock, 
  TrendingUp,
  ArrowUpRight,
  ChefHat,
  Truck,
  Database,
  Cloud,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDashboardRefresh } from '../hooks/useSmartRefresh';
import api from '../api';

// Skeleton Components
const MainStatSkeleton = () => (
  <div className="relative overflow-hidden rounded-2xl bg-dark-100 p-6 animate-pulse">
    <div className="h-4 w-24 bg-dark-200 rounded mb-3"></div>
    <div className="h-10 w-32 bg-dark-200 rounded mb-4"></div>
    <div className="h-4 w-28 bg-dark-200 rounded"></div>
  </div>
);

const QuickStatSkeleton = () => (
  <div className="bg-white rounded-2xl p-5 shadow-card animate-pulse">
    <div className="w-10 h-10 bg-dark-100 rounded-xl mb-3"></div>
    <div className="h-7 w-16 bg-dark-100 rounded mb-2"></div>
    <div className="h-4 w-20 bg-dark-100 rounded"></div>
  </div>
);

const OrderSkeleton = () => (
  <div className="p-4 border-b border-dark-100 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-dark-100 rounded-xl"></div>
        <div>
          <div className="h-4 w-20 bg-dark-100 rounded mb-2"></div>
          <div className="h-3 w-28 bg-dark-100 rounded"></div>
        </div>
      </div>
      <div className="text-right">
        <div className="h-5 w-14 bg-dark-100 rounded mb-2"></div>
        <div className="h-5 w-16 bg-dark-100 rounded"></div>
      </div>
    </div>
  </div>
);

// Format bytes to human readable
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Storage Progress Bar Component
const StorageProgressBar = ({ used, limit, label, icon: Icon, color, percentage }) => {
  const getStatusColor = (pct) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 75) return 'bg-yellow-500';
    return color || 'bg-green-500';
  };

  const getStatusIcon = (pct) => {
    if (pct >= 90) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (pct >= 75) return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-dark-500" />
          <span className="text-sm font-medium text-dark-700">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(percentage)}
          <span className="text-sm font-semibold text-dark-900">{percentage}%</span>
        </div>
      </div>
      <div className="h-3 bg-dark-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getStatusColor(percentage)} transition-all duration-500 rounded-full`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-dark-400">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(limit)} limit</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data: stats, loading } = useDashboardRefresh(10000);
  const [storageStats, setStorageStats] = useState(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageError, setStorageError] = useState(null);

  // Fetch storage stats
  const fetchStorageStats = async () => {
    try {
      setStorageLoading(true);
      setStorageError(null);
      const response = await api.get('/analytics/storage');
      setStorageStats(response.data);
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      setStorageError(error.message);
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageStats();
    // Refresh storage stats every 5 minutes
    const interval = setInterval(fetchStorageStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const mainStats = [
    { 
      label: 'Total Revenue', 
      value: `₹${(stats?.totalRevenue || 0).toLocaleString()}`, 
      icon: IndianRupee, 
      gradient: 'from-primary-500 to-primary-600',
    },
    { 
      label: "Today's Revenue", 
      value: `₹${(stats?.todayRevenue || 0).toLocaleString()}`, 
      icon: TrendingUp, 
      gradient: 'from-accent-500 to-accent-600',
    },
  ];

  const quickStats = [
    { label: 'Total Orders', value: stats?.totalOrders || 0, icon: ShoppingBag, bg: 'bg-blue-50', iconBg: 'bg-blue-500' },
    { label: 'Today Orders', value: stats?.todayOrders || 0, icon: Clock, bg: 'bg-green-50', iconBg: 'bg-green-500' },
    { label: 'Customers', value: stats?.totalCustomers || 0, icon: Users, bg: 'bg-purple-50', iconBg: 'bg-purple-500' },
    { label: 'Menu Items', value: stats?.menuItems || 0, icon: UtensilsCrossed, bg: 'bg-orange-50', iconBg: 'bg-orange-500' },
  ];

  const getStatusStyle = (status) => {
    const styles = {
      delivered: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
      preparing: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
      confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
      ready: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
      out_for_delivery: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
    };
    return styles[status] || styles.pending;
  };

  // Show skeleton only on initial load
  const showSkeleton = loading && !stats;

  return (
    <div className="space-y-6">
      {/* Live Indicator */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full live-indicator"></span>
          <span className="text-xs font-medium text-green-700">Live Updates</span>
        </div>
      </div>

      {/* Main Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {showSkeleton ? (
          <>
            <MainStatSkeleton />
            <MainStatSkeleton />
          </>
        ) : (
          mainStats.map((stat) => (
            <div key={stat.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.gradient} p-6 text-white shadow-lg`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">{stat.label}</p>
                    <p className="text-4xl font-bold mt-2">{stat.value}</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-xl">
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showSkeleton ? (
          <>
            <QuickStatSkeleton />
            <QuickStatSkeleton />
            <QuickStatSkeleton />
            <QuickStatSkeleton />
          </>
        ) : (
          quickStats.map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-card card-hover">
              <div className={`${stat.iconBg} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-dark-900">{stat.value}</p>
              <p className="text-dark-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))
        )}
      </div>

      {/* Action Cards & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Actions */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-dark-100">
            <h2 className="text-lg font-bold text-dark-900">Pending Actions</h2>
            <p className="text-dark-400 text-sm">Orders requiring attention</p>
          </div>
          <div className="p-5 space-y-3">
            {showSkeleton ? (
              <>
                <div className="h-16 bg-dark-100 rounded-xl animate-pulse"></div>
                <div className="h-16 bg-dark-100 rounded-xl animate-pulse"></div>
                <div className="h-16 bg-dark-100 rounded-xl animate-pulse"></div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800">Pending</p>
                      <p className="text-xs text-dark-400">Awaiting confirmation</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-yellow-600">{stats?.pendingOrders || 0}</span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl border border-orange-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <ChefHat className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800">Preparing</p>
                      <p className="text-xs text-dark-400">In the kitchen</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-orange-600">{stats?.preparingOrders || 0}</span>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Truck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800">Out for Delivery</p>
                      <p className="text-xs text-dark-400">On the way</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-indigo-600">{stats?.outForDeliveryOrders || 0}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-dark-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-dark-900">Recent Orders</h2>
              <p className="text-dark-400 text-sm">Latest order activity</p>
            </div>
            <a href="/orders" className="text-primary-600 text-sm font-medium hover:text-primary-700 flex items-center gap-1">
              View All <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
          
          <div className="divide-y divide-dark-100">
            {showSkeleton ? (
              <>
                <OrderSkeleton />
                <OrderSkeleton />
                <OrderSkeleton />
              </>
            ) : stats?.recentOrders?.length > 0 ? (
              stats.recentOrders.map(order => {
                const statusStyle = getStatusStyle(order.status);
                return (
                  <div key={order._id} className="p-4 hover:bg-dark-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-dark-100 rounded-xl flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-dark-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-dark-900">{order.orderId}</p>
                          <p className="text-sm text-dark-400">
                            {order.items?.length || 0} items • {order.serviceType || 'Delivery'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-dark-900">₹{order.totalAmount}</p>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}></span>
                          {order.status?.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center">
                <ShoppingBag className="w-12 h-12 text-dark-200 mx-auto mb-3" />
                <p className="text-dark-400">No recent orders</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Storage Stats Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MongoDB Storage */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-dark-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Database className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-dark-900">MongoDB Storage</h2>
                <p className="text-dark-400 text-sm">Free Tier: 512 MB</p>
              </div>
            </div>
            <button 
              onClick={fetchStorageStats}
              disabled={storageLoading}
              className="p-2 hover:bg-dark-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-dark-400 ${storageLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="p-5">
            {storageLoading && !storageStats ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-3 bg-dark-100 rounded-full"></div>
                <div className="h-8 bg-dark-100 rounded"></div>
                <div className="h-20 bg-dark-100 rounded"></div>
              </div>
            ) : storageError ? (
              <div className="text-center py-4">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-dark-400 text-sm">Failed to load storage stats</p>
              </div>
            ) : storageStats?.mongodb ? (
              <div className="space-y-5">
                <StorageProgressBar 
                  used={storageStats.mongodb.dataSize}
                  limit={storageStats.mongodb.limit}
                  label="Data Storage"
                  icon={HardDrive}
                  color="bg-green-500"
                  percentage={storageStats.mongodb.percentage}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Data Size</p>
                    <p className="font-semibold text-dark-900">{formatBytes(storageStats.mongodb.dataSize)}</p>
                  </div>
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Index Size</p>
                    <p className="font-semibold text-dark-900">{formatBytes(storageStats.mongodb.indexSize)}</p>
                  </div>
                </div>

                <div className="bg-dark-50 rounded-xl p-3">
                  <p className="text-xs text-dark-400 mb-2">Free Space Remaining</p>
                  <p className="text-xl font-bold text-green-600">{formatBytes(storageStats.mongodb.freeSpaceRemaining)}</p>
                </div>

                {/* Top Collections */}
                <div>
                  <p className="text-xs text-dark-400 mb-2">Top Collections by Size</p>
                  <div className="space-y-2">
                    {storageStats.mongodb.collections?.slice(0, 5).map((col, idx) => (
                      <div key={col.name} className="flex items-center justify-between text-sm">
                        <span className="text-dark-600 truncate flex-1">{col.name}</span>
                        <span className="text-dark-400 ml-2">{col.count} docs</span>
                        <span className="font-medium text-dark-800 ml-3 w-20 text-right">{formatBytes(col.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Cloudinary Storage */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-5 border-b border-dark-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Cloud className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-dark-900">Cloudinary Storage</h2>
                <p className="text-dark-400 text-sm">Free Tier: 25 GB</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            {storageLoading && !storageStats ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-3 bg-dark-100 rounded-full"></div>
                <div className="h-8 bg-dark-100 rounded"></div>
                <div className="h-20 bg-dark-100 rounded"></div>
              </div>
            ) : storageStats?.cloudinary?.error ? (
              <div className="text-center py-4">
                <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-dark-400 text-sm">Unable to fetch Cloudinary stats</p>
                <p className="text-xs text-dark-300 mt-1">Check API credentials</p>
              </div>
            ) : storageStats?.cloudinary?.storage ? (
              <div className="space-y-5">
                <StorageProgressBar 
                  used={storageStats.cloudinary.storage.used}
                  limit={storageStats.cloudinary.storage.limit}
                  label="Storage"
                  icon={HardDrive}
                  color="bg-blue-500"
                  percentage={storageStats.cloudinary.storage.percentage}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Plan</p>
                    <p className="font-semibold text-dark-900 capitalize">{storageStats.cloudinary.plan}</p>
                  </div>
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Total Resources</p>
                    <p className="font-semibold text-dark-900">{storageStats.cloudinary.resources}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Bandwidth Used</p>
                    <p className="font-semibold text-dark-900">{formatBytes(storageStats.cloudinary.bandwidth.used)}</p>
                  </div>
                  <div className="bg-dark-50 rounded-xl p-3">
                    <p className="text-xs text-dark-400 mb-1">Transformations</p>
                    <p className="font-semibold text-dark-900">{storageStats.cloudinary.transformations.used.toLocaleString()}</p>
                  </div>
                </div>

                {storageStats.cloudinary.credits && (
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-blue-600">Monthly Credits</p>
                      <p className="font-semibold text-blue-700">
                        {storageStats.cloudinary.credits.used.toFixed(2)} / {storageStats.cloudinary.credits.limit}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Cloud className="w-8 h-8 text-dark-200 mx-auto mb-2" />
                <p className="text-dark-400 text-sm">No Cloudinary data</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
