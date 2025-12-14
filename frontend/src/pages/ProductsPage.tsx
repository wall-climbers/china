import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { Sparkles, Loader, X, Save, FileText, Video, ChevronDown, ChevronUp, ExternalLink, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  purchaseUrl?: string;
}

interface GeneratedPost {
  id: string;
  product_id: string;
  type: string;
  content: string;
  media_url: string;
  status: string;
}

const ProductsPage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productPosts, setProductPosts] = useState<GeneratedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [editingPost, setEditingPost] = useState<GeneratedPost | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchProductPosts(selectedProduct.id);
    }
  }, [selectedProduct]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/products', { withCredentials: true });
      setProducts(response.data.products);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductPosts = async (productId: string) => {
    setLoadingPosts(true);
    try {
      const response = await axios.get('/api/ai/posts', { withCredentials: true });
      const posts = response.data.posts.filter((post: GeneratedPost) => post.product_id === productId);
      setProductPosts(posts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleGeneratePost = async (productId: string, type: 'post' | 'video') => {
    setGenerating(productId);
    const loadingToast = toast.loading(`Generating ${type === 'post' ? 'post' : 'creative'}...`);
    try {
      await axios.post('/api/ai/generate', { productId, type }, { withCredentials: true });
      toast.success(`${type === 'post' ? 'Post' : 'Creative'} generated successfully!`, { id: loadingToast });
      if (selectedProduct?.id === productId) {
        fetchProductPosts(productId);
      }
    } catch (error) {
      console.error('Error generating content:', error);
      toast.error('Failed to generate content', { id: loadingToast });
    } finally {
      setGenerating(null);
    }
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setEditingPost(null);
    setDescriptionExpanded(false);
  };

  const handleClosePanel = () => {
    setSelectedProduct(null);
    setProductPosts([]);
    setEditingPost(null);
  };

  const handleEditPost = (post: GeneratedPost) => {
    setEditingPost(post);
    setEditedContent(post.content);
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;

    setSaving(true);
    try {
      await axios.put(
        `/api/ai/posts/${editingPost.id}`,
        { content: editedContent },
        { withCredentials: true }
      );
      
      // Update local state
      setProductPosts(posts =>
        posts.map(post =>
          post.id === editingPost.id ? { ...post, content: editedContent } : post
        )
      );
      
      setEditingPost(null);
      toast.success('Post updated successfully!');
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      await axios.delete(`/api/ai/posts/${postId}`, { withCredentials: true });
      setProductPosts(posts => posts.filter(post => post.id !== postId));
      toast.success('Post deleted successfully!');
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Products</h1>

        {products.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">No products found. Connect a catalog and sync products from the dashboard.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => handleProductClick(product)}
                className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all cursor-pointer ${
                  selectedProduct?.id === product.id ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.title}</h3>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{product.description}</p>
                  <p className="text-xl font-bold text-blue-600 mb-4">${product.price}</p>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleGeneratePost(product.id, 'post')}
                      disabled={generating === product.id}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                    >
                      {generating === product.id ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Post
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => navigate(`/creative/${product.id}`)}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Creative
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selectedProduct && (
        <div className="fixed inset-y-0 right-0 w-full md:w-1/2 lg:w-1/3 bg-white shadow-2xl z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 truncate pr-4">Product Details</h2>
            <button
              onClick={handleClosePanel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>

          <div className="p-6">
            {/* Product Info */}
            <div className="mb-6 pb-6 border-b">
              <div className="relative mb-4 group">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.title}
                  className="w-full h-48 object-cover rounded-lg"
                />
                {selectedProduct.purchaseUrl && (
                  <a
                    href={selectedProduct.purchaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-3 right-3 p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-orange-500 hover:text-white text-gray-700 transition-all duration-200 hover:scale-110"
                    title="Buy this product"
                  >
                    <ExternalLink className="h-5 w-5" />
                  </a>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {selectedProduct.title}
              </h3>
              <p className="text-xl font-bold text-blue-600 mb-4">${selectedProduct.price}</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div 
                  className={`text-sm text-gray-700 bg-gray-50 p-4 overflow-hidden transition-all duration-300 ${
                    descriptionExpanded ? 'max-h-none' : 'max-h-32'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {selectedProduct.description.split('\n').map((line, index) => {
                      // Check if line is a section header (starts with emoji)
                      const isHeader = /^[⌚✨💖📱🎨🔋🛒]/.test(line.trim());
                      // Check if line is a bullet point
                      const isBullet = line.trim().startsWith('•');
                      
                      if (isHeader) {
                        return (
                          <div key={index} className="font-semibold text-gray-900 mt-4 mb-2 first:mt-0">
                            {line}
                          </div>
                        );
                      } else if (isBullet) {
                        return (
                          <div key={index} className="ml-2 mb-1">
                            {line}
                          </div>
                        );
                      } else if (line.trim() === '') {
                        return <div key={index} className="h-2" />;
                      } else {
                        return (
                          <div key={index} className="mb-1">
                            {line}
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
                {/* Expand/Collapse button */}
                <button
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-medium text-blue-600 bg-white border-t border-gray-200 hover:bg-blue-50 transition-colors"
                >
                  {descriptionExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Show Full Description
                    </>
                  )}
                </button>
              </div>
              {selectedProduct.purchaseUrl && (
                <a
                  href={selectedProduct.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 w-full inline-flex items-center justify-center px-4 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
                >
                  🛒 Buy Now on AliExpress
                </a>
              )}
            </div>

            {/* Generated Posts */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Generated Content</h3>

              {loadingPosts ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : productPosts.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4">No content generated yet</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => handleGeneratePost(selectedProduct.id, 'post')}
                      disabled={generating === selectedProduct.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      Generate Post
                    </button>
                    <button
                      onClick={() => navigate(`/creative/${selectedProduct.id}`)}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                    >
                      Generate Creative
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {productPosts.map((post) => (
                    <div key={post.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {post.type === 'post' ? (
                            <FileText className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Video className="h-5 w-5 text-purple-600" />
                          )}
                          <span className="font-semibold text-gray-900 capitalize">
                            {post.type}
                          </span>
                        </div>
                        {editingPost?.id !== post.id && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditPost(post)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      {editingPost?.id === post.id ? (
                        <div>
                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 text-sm"
                            placeholder="Edit your post content..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                            >
                              <Save className="h-4 w-4" />
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingPost(null)}
                              disabled={saving}
                              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {post.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={handleClosePanel}
        />
      )}
    </div>
  );
};

export default ProductsPage;
