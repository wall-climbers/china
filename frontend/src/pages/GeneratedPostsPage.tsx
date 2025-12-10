import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Facebook, Instagram, ExternalLink, Copy, CheckCircle } from 'lucide-react';

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

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await axios.get('/api/ai/posts', { withCredentials: true });
      setPosts(response.data.posts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (postId: string, platform: 'facebook' | 'instagram') => {
    setSharing(postId);
    try {
      await axios.post(`/api/social/share/${platform}`, { postId }, { withCredentials: true });
      alert(`Successfully shared to ${platform}!`);
      fetchPosts();
    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      alert(`Failed to share to ${platform}`);
    } finally {
      setSharing(null);
    }
  };

  const handleGenerateCheckout = async (productId: string, postId: string) => {
    try {
      const response = await axios.post('/checkout/create', { productId }, { withCredentials: true });
      setCheckoutUrls({ ...checkoutUrls, [postId]: response.data.checkoutUrl });
    } catch (error) {
      console.error('Error generating checkout URL:', error);
      alert('Failed to generate checkout URL');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('Checkout URL copied to clipboard!');
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
                    <img
                      src={post.product_image}
                      alt={post.product_title}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{post.product_title}</h3>
                      <p className="text-sm text-gray-500">
                        {post.type === 'post' ? 'Social Post' : 'Video Post'}
                      </p>
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
    </div>
  );
};

export default GeneratedPostsPage;

