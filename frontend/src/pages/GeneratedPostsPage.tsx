import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Facebook, Instagram, ExternalLink, Copy, CheckCircle, Play, X } from 'lucide-react';
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

const GeneratedPostsPage = () => {
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [checkoutUrls, setCheckoutUrls] = useState<{ [key: string]: string }>({});
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {posts.map((post) => (
              <div key={post.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="relative">
                      <img
                        src={post.product_image}
                        alt={post.product_title}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                      {post.type === 'video' && isValidVideoUrl(post.media_url) && (
                        <button
                          onClick={() => setViewingVideo(post.media_url)}
                          className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg hover:bg-opacity-70 transition-all"
                          title="Play video"
                        >
                          <Play className="h-8 w-8 text-white" fill="white" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{post.product_title}</h3>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-500">
                          {post.type === 'post' ? 'Social Post' : 'Video Post'}
                        </p>
                        {post.type === 'video' && isValidVideoUrl(post.media_url) && (
                          <button
                            onClick={() => setViewingVideo(post.media_url)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View Video
                          </button>
                        )}
                        {post.type === 'video' && !isValidVideoUrl(post.media_url) && (
                          <span className="text-xs text-gray-400 italic">
                            (Video not available)
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-blue-600 mt-1">${post.price}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                  </div>

                  {/* Share Buttons */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => handleShare(post.id, 'facebook')}
                      disabled={sharing === post.id || post.shared_to_facebook}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {post.shared_to_facebook ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Shared to Facebook
                        </>
                      ) : (
                        <>
                          <Facebook className="h-4 w-4 mr-2" />
                          Share to Facebook
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleShare(post.id, 'instagram')}
                      disabled={sharing === post.id || post.shared_to_instagram}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {post.shared_to_instagram ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Shared to Instagram
                        </>
                      ) : (
                        <>
                          <Instagram className="h-4 w-4 mr-2" />
                          Share to Instagram
                        </>
                      )}
                    </button>
                  </div>

                  {/* Checkout URL */}
                  <div className="border-t pt-4">
                    {checkoutUrls[post.id] ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={checkoutUrls[post.id]}
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                        />
                        <button
                          onClick={() => handleCopyUrl(checkoutUrls[post.id])}
                          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <a
                          href={checkoutUrls[post.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateCheckout(post.product_id, post.id)}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Generate Checkout URL
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
