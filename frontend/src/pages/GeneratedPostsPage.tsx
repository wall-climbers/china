import { useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Facebook, Instagram, ExternalLink, Copy, CheckCircle, Play, X, ChevronDown, ChevronUp, Package } from 'lucide-react';
import toast from 'react-hot-toast';

interface GeneratedPost {
  id: string;
  product_id: string;
  type: string;
  content: string;
  media_url: string;
  status: string;
  shared_to_facebook: boolean;
  shared_to_instagram: boolean;
  product_title: string;
  product_image: string;
  price: number;
}

interface ProductGroup {
  product_id: string;
  product_title: string;
  product_image: string;
  price: number;
  posts: GeneratedPost[];
}

const GeneratedPostsPage = () => {
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [checkoutUrls, setCheckoutUrls] = useState<{ [key: string]: string }>({});
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Group posts by product
  const productGroups = useMemo(() => {
    const groups: Map<string, ProductGroup> = new Map();
    
    posts.forEach(post => {
      if (!groups.has(post.product_id)) {
        groups.set(post.product_id, {
          product_id: post.product_id,
          product_title: post.product_title,
          product_image: post.product_image,
          price: post.price,
          posts: []
        });
      }
      groups.get(post.product_id)!.posts.push(post);
    });
    
    return Array.from(groups.values());
  }, [posts]);

  const toggleProductExpanded = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedProducts(new Set(productGroups.map(g => g.product_id)));
  };

  const collapseAll = () => {
    setExpandedProducts(new Set());
  };

  // Helper to check if a video URL is valid and accessible
  const isValidVideoUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    if (url.trim() === '') return false;
    
    // Must be an S3 URL with .mp4 extension
    if (!url.includes('.mp4')) return false;
    
    // Exclude mock URLs
    if (url.includes('example.com')) return false;
    if (url.includes('mock-')) return false;
    
    // Must be a real S3 URL (not just any URL with .mp4)
    // Check if it starts with https:// and contains s3
    if (!url.startsWith('https://')) return false;
    if (!url.includes('.s3.')) return false;
    
    // Make sure it has a timestamp (real S3 uploads have timestamps in filename)
    const filename = url.split('/').pop() || '';
    const hasTimestamp = /\d{13}/.test(filename); // 13-digit timestamp
    
    return hasTimestamp;
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await axios.get('/api/ai/posts', { withCredentials: true });
      console.log('Fetched posts:', response.data.posts);
      setPosts(response.data.posts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (postId: string, platform: 'facebook' | 'instagram') => {
    setSharing(postId);
    const loadingToast = toast.loading(`Sharing to ${platform}...`);
    try {
      await axios.post(`/api/social/share/${platform}`, { postId }, { withCredentials: true });
      toast.success(`Successfully shared to ${platform}!`, { id: loadingToast });
      fetchPosts();
    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      toast.error(`Failed to share to ${platform}`, { id: loadingToast });
    } finally {
      setSharing(null);
    }
  };

  const handleGenerateCheckout = async (productId: string, postId: string) => {
    const loadingToast = toast.loading('Generating checkout URL...');
    try {
      const response = await axios.post('/checkout/create', { productId }, { withCredentials: true });
      setCheckoutUrls({ ...checkoutUrls, [postId]: response.data.checkoutUrl });
      toast.success('Checkout URL generated!', { id: loadingToast });
    } catch (error) {
      console.error('Error generating checkout URL:', error);
      toast.error('Failed to generate checkout URL', { id: loadingToast });
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Checkout URL copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Generated Posts</h1>

        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">No posts generated yet. Generate posts from the Products page.</p>
          </div>
        ) : (
          <>
            {/* Expand/Collapse All */}
            <div className="flex justify-end gap-2 mb-4">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Collapse All
              </button>
            </div>

            {/* Product Groups */}
            <div className="space-y-4">
              {productGroups.map((group) => {
                const isExpanded = expandedProducts.has(group.product_id);
                return (
                  <div key={group.product_id} className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Product Header */}
                    <button
                      onClick={() => toggleProductExpanded(group.product_id)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                    >
                      <img
                        src={group.product_image}
                        alt={group.product_title}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-gray-900">{group.product_title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-lg font-bold text-blue-600">${group.price}</span>
                          <span className="text-sm text-gray-500 flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            {group.posts.length} {group.posts.length === 1 ? 'post' : 'posts'}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </button>

                    {/* Posts for this product */}
                    {isExpanded && (
                      <div className="border-t">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                          {group.posts.map((post) => (
                            <div key={post.id} className="border border-gray-200 rounded-lg overflow-hidden">
                              {/* Media Preview */}
                              <div className="relative aspect-video bg-gray-100">
                                {post.type === 'video' && isValidVideoUrl(post.media_url) ? (
                                  <>
                                    <video
                                      src={post.media_url}
                                      className="w-full h-full object-cover"
                                      muted
                                      preload="metadata"
                                    />
                                    <button
                                      onClick={() => setViewingVideo(post.media_url)}
                                      className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center hover:bg-opacity-50 transition-all group"
                                    >
                                      <div className="w-14 h-14 rounded-full bg-white bg-opacity-90 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Play className="h-7 w-7 text-gray-800 ml-1" fill="currentColor" />
                                      </div>
                                    </button>
                                    <span className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-70 text-white text-xs font-medium rounded">
                                      Video
                                    </span>
                                  </>
                                ) : post.type === 'video' ? (
                                  <>
                                    <img
                                      src={post.product_image}
                                      alt={post.product_title}
                                      className="w-full h-full object-cover opacity-50"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="px-3 py-1.5 bg-gray-800 bg-opacity-70 text-white text-sm rounded">
                                        Video not available
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <img
                                      src={post.product_image}
                                      alt={post.product_title}
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-70 text-white text-xs font-medium rounded">
                                      Image
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Post Content */}
                              <div className="p-4">
                                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{post.content}</p>
                                </div>

                              {/* Share Buttons */}
                              <div className="flex gap-2 mb-3">
                                <button
                                  onClick={() => handleShare(post.id, 'facebook')}
                                  disabled={sharing === post.id || post.shared_to_facebook}
                                  className="flex-1 flex items-center justify-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  {post.shared_to_facebook ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                      Shared
                                    </>
                                  ) : (
                                    <>
                                      <Facebook className="h-3.5 w-3.5 mr-1.5" />
                                      Facebook
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleShare(post.id, 'instagram')}
                                  disabled={sharing === post.id || post.shared_to_instagram}
                                  className="flex-1 flex items-center justify-center px-3 py-1.5 text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  {post.shared_to_instagram ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                      Shared
                                    </>
                                  ) : (
                                    <>
                                      <Instagram className="h-3.5 w-3.5 mr-1.5" />
                                      Instagram
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Checkout URL */}
                              <div className="border-t pt-3">
                                {checkoutUrls[post.id] ? (
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={checkoutUrls[post.id]}
                                      readOnly
                                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md bg-gray-50 text-xs"
                                    />
                                    <button
                                      onClick={() => handleCopyUrl(checkoutUrls[post.id])}
                                      className="px-2 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                    <a
                                      href={checkoutUrls[post.id]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleGenerateCheckout(post.product_id, post.id)}
                                    className="w-full px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                                  >
                                    Generate Checkout URL
                                  </button>
                                )}
                              </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Video Modal */}
      {viewingVideo && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingVideo(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Generated Video</h3>
              <button
                onClick={() => setViewingVideo(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4">
              <video
                controls
                autoPlay
                className="w-full rounded-lg"
                style={{ maxHeight: 'calc(90vh - 120px)' }}
              >
                <source src={viewingVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Video URL: 
                  <a 
                    href={viewingVideo} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 ml-2"
                  >
                    Open in new tab
                  </a>
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewingVideo);
                    toast.success('Video URL copied to clipboard!');
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedPostsPage;
