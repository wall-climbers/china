import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Facebook, Instagram, Copy, CheckCircle, Play, X, ChevronDown, ChevronUp, Package, Pencil, Trash2, ShoppingBag, Eye, Megaphone } from 'lucide-react';
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [checkoutUrls, setCheckoutUrls] = useState<{ [key: string]: string }>({});
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [editingPost, setEditingPost] = useState<GeneratedPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewingOverlay, setPreviewingOverlay] = useState<GeneratedPost | null>(null);
  const [previewTab, setPreviewTab] = useState<'with' | 'without'>('with');

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

  // Auto-expand accordion if productId is in URL query params
  useEffect(() => {
    const productId = searchParams.get('productId');
    if (productId && posts.length > 0) {
      // Check if this product has posts
      const hasProduct = posts.some(post => post.product_id === productId);
      if (hasProduct) {
        // Expand the accordion for this product
        setExpandedProducts(prev => new Set([...prev, productId]));
        // Show success message
        toast.success('Post created! View it below.');
        // Clear the query parameter to prevent repeated toasts
        navigate('/posts', { replace: true });
        
        // Scroll to the product section after a brief delay
        setTimeout(() => {
          const element = document.getElementById(`product-${productId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    }
  }, [searchParams, posts, navigate]);

  // Lock body scroll when any modal is open
  useEffect(() => {
    if (viewingVideo || editingPost || previewingOverlay) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [viewingVideo, editingPost, previewingOverlay]);

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

  const handleEditPost = (post: GeneratedPost) => {
    setEditingPost(post);
    setEditContent(post.content);
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    
    setSaving(true);
    const loadingToast = toast.loading('Saving changes...');
    try {
      await axios.put(`/api/ai/posts/${editingPost.id}`, { content: editContent }, { withCredentials: true });
      toast.success('Post updated successfully!', { id: loadingToast });
      
      // Update local state
      setPosts(posts.map(p => 
        p.id === editingPost.id ? { ...p, content: editContent } : p
      ));
      
      setEditingPost(null);
      setEditContent('');
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post', { id: loadingToast });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }
    
    const loadingToast = toast.loading('Deleting post...');
    try {
      await axios.delete(`/api/ai/posts/${postId}`, { withCredentials: true });
      toast.success('Post deleted successfully!', { id: loadingToast });
      
      // Update local state
      setPosts(posts.filter(p => p.id !== postId));
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post', { id: loadingToast });
    }
  };

  const handlePreviewWithOverlay = async (post: GeneratedPost) => {
    // Use direct /buy/{productId} URL format instead of creating checkout session
    const directBuyUrl = getCheckoutPageUrl(post);
    setCheckoutUrls(prev => ({ ...prev, [post.id]: directBuyUrl }));
    setPreviewingOverlay(post);
  };

  const getCheckoutPageUrl = (post: GeneratedPost) => {
    // Get the base URL dynamically - use /buy/ route for direct product checkout
    const baseUrl = window.location.origin;
    return `${baseUrl}/buy/${post.product_id}`;
  };

  const handleCopyPostWithOverlay = (post: GeneratedPost, withCheckout: boolean = true) => {
    if (withCheckout) {
      const checkoutUrl = getCheckoutPageUrl(post);
      const postWithLink = `${post.content}\n\n🛒 Shop now: ${checkoutUrl}`;
      navigator.clipboard.writeText(postWithLink);
      toast.success('Post with checkout link copied!');
    } else {
      navigator.clipboard.writeText(post.content);
      toast.success('Post copied to clipboard!');
    }
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
                  <div 
                    key={group.product_id} 
                    id={`product-${group.product_id}`}
                    className="bg-white rounded-lg shadow-md overflow-hidden"
                  >
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
                                {/* Caption Preview */}
                                <div className="relative bg-gray-50 rounded-lg p-3 mb-4">
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3 pr-16">{post.content}</p>
                                  {/* Edit/Delete - Top Right Corner */}
                                  <div className="absolute top-2 right-2 flex gap-0.5">
                                    <button
                                      onClick={() => handleEditPost(post)}
                                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-white rounded transition-colors"
                                      title="Edit post"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePost(post.id)}
                                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-white rounded transition-colors"
                                      title="Delete post"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Action Buttons - Clean Grid */}
                                <div className="grid grid-cols-4 gap-2">
                                  {/* Share & Promote Button */}
                                  <button
                                    onClick={() => handlePreviewWithOverlay(post)}
                                    className="col-span-4 flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-orange-600 hover:to-pink-600 transition-all shadow-sm"
                                  >
                                    <ShoppingBag className="h-4 w-4" />
                                    Share & Promote
                                  </button>

                                  {/* Quick Share Icons */}
                                  <button
                                    onClick={() => handleShare(post.id, 'facebook')}
                                    disabled={sharing === post.id || post.shared_to_facebook}
                                    className={`col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all ${
                                      post.shared_to_facebook 
                                        ? 'bg-green-50 text-green-600 border border-green-200' 
                                        : 'bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2] hover:text-white border border-[#1877F2]/20'
                                    }`}
                                    title={post.shared_to_facebook ? 'Already shared' : 'Quick share to Facebook'}
                                  >
                                    {post.shared_to_facebook ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Facebook className="h-4 w-4" />
                                    )}
                                    <span className="text-xs font-medium">
                                      {post.shared_to_facebook ? 'Shared' : 'Facebook'}
                                    </span>
                                  </button>

                                  <button
                                    onClick={() => handleShare(post.id, 'instagram')}
                                    disabled={sharing === post.id || post.shared_to_instagram}
                                    className={`col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all ${
                                      post.shared_to_instagram 
                                        ? 'bg-green-50 text-green-600 border border-green-200' 
                                        : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-pink-600 hover:from-purple-600 hover:to-pink-600 hover:text-white border border-pink-200'
                                    }`}
                                    title={post.shared_to_instagram ? 'Already shared' : 'Quick share to Instagram'}
                                  >
                                    {post.shared_to_instagram ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Instagram className="h-4 w-4" />
                                    )}
                                    <span className="text-xs font-medium">
                                      {post.shared_to_instagram ? 'Shared' : 'Instagram'}
                                    </span>
                                  </button>
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
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Generated Video</h3>
              <button
                onClick={() => setViewingVideo(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
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

      {/* Edit Post Modal */}
      {editingPost && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingPost(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Edit Post</h3>
              <button
                onClick={() => setEditingPost(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {/* Product Info */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                <img
                  src={editingPost.product_image}
                  alt={editingPost.product_title}
                  className="w-12 h-12 object-cover rounded-lg"
                />
                <div>
                  <h4 className="font-medium text-gray-900">{editingPost.product_title}</h4>
                  <p className="text-sm text-gray-500">
                    {editingPost.type === 'video' ? 'Video Post' : 'Social Post'}
                  </p>
                </div>
              </div>

              {/* Media Preview */}
              {editingPost.type === 'video' && isValidVideoUrl(editingPost.media_url) && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Video Preview</label>
                  <video
                    src={editingPost.media_url}
                    controls
                    className="w-full rounded-lg max-h-48 object-contain bg-black"
                  />
                </div>
              )}

              {/* Content Editor */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Post Content</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Enter your post content..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editContent.length} characters
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEditingPost(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || editContent.trim() === ''}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Social Media Share Preview Modal */}
      {previewingOverlay && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewingOverlay(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Share to Social Media</h3>
              <button
                onClick={() => setPreviewingOverlay(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {/* Toggle Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setPreviewTab('with')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                    previewTab === 'with'
                      ? 'bg-orange-100 text-orange-700 border-2 border-orange-500'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                  }`}
                >
                  <ShoppingBag className="h-4 w-4 inline mr-2" />
                  With Checkout Link
                </button>
                <button
                  onClick={() => setPreviewTab('without')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                    previewTab === 'without'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                  }`}
                >
                  <Facebook className="h-4 w-4 inline mr-2" />
                  Without Checkout Link
                </button>
              </div>

              {/* Side-by-side Social Media Previews */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Facebook Preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-[#1877F2] text-white px-3 py-2 flex items-center gap-2">
                    <Facebook className="h-4 w-4" />
                    <span className="text-sm font-medium">Facebook Preview</span>
                  </div>
                  <div className="bg-white p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Your Business</p>
                        <p className="text-xs text-gray-500">Just now · 🌐</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-800 mb-2 whitespace-pre-wrap line-clamp-3">
                      {previewingOverlay.content}
                    </p>
                    {previewTab === 'with' && (
                      <p className="text-sm mb-2">
                        🛒 Shop now:{' '}
                        <a
                          href={getCheckoutPageUrl(previewingOverlay)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getCheckoutPageUrl(previewingOverlay)}
                        </a>
                      </p>
                    )}
                    <a 
                      href={previewTab === 'with' ? getCheckoutPageUrl(previewingOverlay) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`relative rounded overflow-hidden block ${previewTab === 'with' ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
                      onClick={(e) => {
                        if (previewTab !== 'with') e.preventDefault();
                      }}
                    >
                      {previewingOverlay.type === 'video' && isValidVideoUrl(previewingOverlay.media_url) ? (
                        <video
                          src={previewingOverlay.media_url}
                          className="w-full aspect-video object-cover"
                          controls
                          muted
                          playsInline
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <img
                          src={previewingOverlay.product_image}
                          alt={previewingOverlay.product_title}
                          className="w-full aspect-video object-cover"
                        />
                      )}
                      {previewTab === 'with' && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
                          <p className="text-white text-xs font-medium truncate">{previewingOverlay.product_title}</p>
                          <p className="text-white/80 text-xs">${previewingOverlay.price} · Shop Now →</p>
                        </div>
                      )}
                    </a>
                    <div className="flex items-center justify-around mt-2 pt-2 border-t text-gray-500 text-xs">
                      <span>👍 Like</span>
                      <span>💬 Comment</span>
                      <span>↗️ Share</span>
                    </div>
                  </div>
                </div>

                {/* Instagram Preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-3 py-2 flex items-center gap-2">
                    <Instagram className="h-4 w-4" />
                    <span className="text-sm font-medium">Instagram Preview</span>
                  </div>
                  <div className="bg-white">
                    <div className="flex items-center gap-2 p-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full"></div>
                      <p className="text-sm font-semibold text-gray-900">your_business</p>
                    </div>
                    <div className="relative">
                      {previewingOverlay.type === 'video' && isValidVideoUrl(previewingOverlay.media_url) ? (
                        <video
                          src={previewingOverlay.media_url}
                          className="w-full aspect-square object-cover"
                          controls
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={previewingOverlay.product_image}
                          alt={previewingOverlay.product_title}
                          className="w-full aspect-square object-cover"
                        />
                      )}
                      {previewTab === 'with' && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white text-sm font-medium">{previewingOverlay.product_title}</p>
                              <p className="text-white/80 text-xs">${previewingOverlay.price}</p>
                            </div>
                            <a
                              href={getCheckoutPageUrl(previewingOverlay)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white text-black text-sm font-bold px-5 py-2 rounded-full hover:bg-gray-100 hover:scale-105 transition-all cursor-pointer shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Shop
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex gap-4 mb-2">
                        <span>❤️</span>
                        <span>💬</span>
                        <span>📤</span>
                      </div>
                      <p className="text-sm">
                        <span className="font-semibold">your_business</span>{' '}
                        <span className="text-gray-800 line-clamp-2">{previewingOverlay.content.split('\n')[0]}</span>
                      </p>
                      {previewTab === 'with' && checkoutUrls[previewingOverlay.id] && (
                        <a
                          href={checkoutUrls[previewingOverlay.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔗 Link in bio
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Caption Section */}
              <div className="border rounded-lg overflow-hidden mb-4">
                <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Caption</span>
                  <button
                    onClick={() => handleCopyPostWithOverlay(previewingOverlay, previewTab === 'with')}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewingOverlay.content}</p>
                  {previewTab === 'with' && (
                    <div className="mt-3 pt-3 border-t border-dashed">
                      <p className="text-sm">
                        🛒 Shop now:{' '}
                        <a
                          href={getCheckoutPageUrl(previewingOverlay)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getCheckoutPageUrl(previewingOverlay)}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Share Actions */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Share to Social Media</p>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Facebook Share Card */}
                  <button
                    onClick={() => handleShare(previewingOverlay.id, 'facebook')}
                    disabled={sharing === previewingOverlay.id || previewingOverlay.shared_to_facebook}
                    className="group relative flex flex-col items-center p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-[#1877F2] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#1877F2] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Facebook className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-medium text-gray-900">Facebook</span>
                    {previewingOverlay.shared_to_facebook ? (
                      <span className="text-xs text-green-600 flex items-center gap-1 mt-1">
                        <CheckCircle className="h-3 w-3" /> Shared
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 mt-1">Click to share</span>
                    )}
                  </button>

                  {/* Instagram Share Card */}
                  <button
                    onClick={() => handleShare(previewingOverlay.id, 'instagram')}
                    disabled={sharing === previewingOverlay.id || previewingOverlay.shared_to_instagram}
                    className="group relative flex flex-col items-center p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-pink-500 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Instagram className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-medium text-gray-900">Instagram</span>
                    {previewingOverlay.shared_to_instagram ? (
                      <span className="text-xs text-green-600 flex items-center gap-1 mt-1">
                        <CheckCircle className="h-3 w-3" /> Shared
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 mt-1">Click to share</span>
                    )}
                  </button>
                </div>

                {/* Checkout Link Section */}
                {previewTab === 'with' && (
                  <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">Checkout Link Included</p>
                        <p className="text-xs text-gray-600 mt-0.5">Customers can purchase directly from your post</p>
                        <div className="mt-2 flex items-center gap-2">
                          <a
                            href={getCheckoutPageUrl(previewingOverlay)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Preview Page
                          </a>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(getCheckoutPageUrl(previewingOverlay));
                              toast.success('Checkout URL copied!');
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy Link
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === 'without' && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Megaphone className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">Brand Awareness Post</p>
                        <p className="text-xs text-gray-600 mt-0.5">Great for engagement and reaching new audiences</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedPostsPage;
