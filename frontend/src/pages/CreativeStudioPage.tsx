import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { 
  ArrowLeft, ArrowRight, Check, Loader, Users, Image, Film, 
  Wand2, GripVertical, Play, Download, RefreshCw, Plus, Clock, 
  AlertTriangle, X
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
}

interface Scene {
  id: number;
  title: string;
  prompt: string;
  duration: number;
}

interface UgcSession {
  id: string;
  productId: string;
  targetDemographic: any;
  productPrompt: string;
  characterPrompt: string;
  scenes: Scene[];
  generatedCharacters: any[];
  selectedCharacter: string;
  generatedProductImages: any[];
  selectedProductImage: string;
  editedScenes: Scene[];
  videoUrl: string;
  videoProgress: number;
  currentStep: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STEPS = [
  { id: 0, name: 'Target Audience', icon: Users },
  { id: 1, name: 'Character', icon: Image },
  { id: 2, name: 'Product Shot', icon: Image },
  { id: 3, name: 'Scenes', icon: Film },
  { id: 4, name: 'Generate', icon: Wand2 }
];

const CreativeStudioPage = () => {
  const { productId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [session, setSession] = useState<UgcSession | null>(null);
  const [allSessions, setAllSessions] = useState<UgcSession[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // Confirmation modal for going back
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  
  // Step 0: Demographics
  const [demographics, setDemographics] = useState({
    ageGroup: '25-34',
    gender: 'All',
    interests: ['Technology', 'Lifestyle'],
    tone: 'Casual'
  });
  const [demographicOptions, setDemographicOptions] = useState<any>(null);
  
  // Step 1: Characters
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  
  // Step 2: Product Images
  const [productImages, setProductImages] = useState<any[]>([]);
  const [selectedProductImage, setSelectedProductImage] = useState<string | null>(null);
  
  // Step 3: Scenes
  const [scenes, setScenes] = useState<Scene[]>([]);
  
  // Step 4: Video
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('draft');

  useEffect(() => {
    fetchProduct();
    fetchDemographicOptions();
  }, [productId]);

  useEffect(() => {
    if (product) {
      loadSessions();
    }
  }, [product]);

  // Poll for video progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (session && currentStep === 4 && videoStatus === 'generating') {
      interval = setInterval(async () => {
        try {
          const response = await axios.get(`/api/ugc/sessions/${session.id}/progress`, { withCredentials: true });
          setVideoProgress(response.data.progress);
          setVideoStatus(response.data.status);
          if (response.data.videoUrl) {
            setVideoUrl(response.data.videoUrl);
          }
          if (response.data.status === 'completed') {
            clearInterval(interval);
            toast.success('Video generated successfully!');
          }
        } catch (error) {
          console.error('Error polling progress:', error);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [session, currentStep, videoStatus]);

  const fetchProduct = async () => {
    try {
      const response = await axios.get('/api/products', { withCredentials: true });
      const foundProduct = response.data.products.find((p: Product) => p.id === productId);
      if (foundProduct) {
        setProduct(foundProduct);
      } else {
        toast.error('Product not found');
        navigate('/products');
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error('Failed to load product');
    }
  };

  const fetchDemographicOptions = async () => {
    try {
      const response = await axios.get('/api/ugc/demographics', { withCredentials: true });
      setDemographicOptions(response.data);
    } catch (error) {
      console.error('Error fetching demographics:', error);
    }
  };

  const loadSessions = async () => {
    setLoading(true);
    try {
      const sessionsResponse = await axios.get('/api/ugc/sessions', { withCredentials: true });
      const productSessions = sessionsResponse.data.sessions.filter(
        (s: UgcSession) => s.productId === productId
      );
      setAllSessions(productSessions);

      // Check if there's a session ID in the URL
      const sessionId = searchParams.get('session');
      
      if (sessionId) {
        // Load specific session
        const targetSession = productSessions.find((s: UgcSession) => s.id === sessionId);
        if (targetSession) {
          loadSessionData(targetSession);
        } else {
          toast.error('Session not found');
          setShowSessionPicker(true);
        }
      } else if (productSessions.length > 0) {
        // Show session picker if there are existing sessions
        setShowSessionPicker(true);
      } else {
        // No sessions exist, create a new one
        await createNewSession();
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionData = (sessionData: UgcSession) => {
    setSession(sessionData);
    setCurrentStep(sessionData.currentStep || 0);
    if (sessionData.scenes) setScenes(sessionData.editedScenes || sessionData.scenes);
    if (sessionData.generatedCharacters) setCharacters(sessionData.generatedCharacters);
    if (sessionData.selectedCharacter) setSelectedCharacter(sessionData.selectedCharacter);
    if (sessionData.generatedProductImages) setProductImages(sessionData.generatedProductImages);
    if (sessionData.selectedProductImage) setSelectedProductImage(sessionData.selectedProductImage);
    if (sessionData.targetDemographic) setDemographics(sessionData.targetDemographic);
    if (sessionData.videoUrl) setVideoUrl(sessionData.videoUrl);
    if (sessionData.videoProgress) setVideoProgress(sessionData.videoProgress);
    if (sessionData.status) setVideoStatus(sessionData.status);
    setShowSessionPicker(false);
    
    // Update URL with session ID
    setSearchParams({ session: sessionData.id });
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post('/api/ugc/sessions', { productId }, { withCredentials: true });
      const newSession = response.data.session;
      setSession(newSession);
      setAllSessions(prev => [newSession, ...prev]);
      setCurrentStep(0);
      setCharacters([]);
      setSelectedCharacter(null);
      setProductImages([]);
      setSelectedProductImage(null);
      setScenes([]);
      setVideoUrl(null);
      setVideoProgress(0);
      setVideoStatus('draft');
      setDemographics({
        ageGroup: '25-34',
        gender: 'All',
        interests: ['Technology', 'Lifestyle'],
        tone: 'Casual'
      });
      setShowSessionPicker(false);
      setSearchParams({ session: newSession.id });
      toast.success('New creative session started!');
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session');
    }
  };

  const handleStepClick = (stepId: number) => {
    // Can only go to completed steps or current step
    if (stepId > currentStep) return;
    if (stepId === currentStep) return;
    
    // Going back requires confirmation
    setPendingStep(stepId);
    setShowBackConfirm(true);
  };

  const confirmGoBack = async () => {
    if (pendingStep === null || !session) return;
    
    // Reset subsequent data when going back
    try {
      if (pendingStep <= 0) {
        // Going back to step 0 - clear everything
        setCharacters([]);
        setSelectedCharacter(null);
        setProductImages([]);
        setSelectedProductImage(null);
        setScenes([]);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 1) {
        // Going back to step 1 - clear from step 2 onwards
        setProductImages([]);
        setSelectedProductImage(null);
        setScenes([]);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 2) {
        // Going back to step 2 - clear from step 3 onwards
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 3) {
        // Going back to step 3 - clear video
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      }

      setCurrentStep(pendingStep);
      setShowBackConfirm(false);
      setPendingStep(null);
      toast.success('You can now edit this step. Subsequent steps will need to be regenerated.');
    } catch (error) {
      console.error('Error going back:', error);
    }
  };

  const handleStep0Submit = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const response = await axios.put(
        `/api/ugc/sessions/${session.id}/demographics`,
        { targetDemographic: demographics },
        { withCredentials: true }
      );
      setScenes(response.data.scenes);
      setCurrentStep(1);
      toast.success('Audience profile created!');
    } catch (error) {
      console.error('Error saving demographics:', error);
      toast.error('Failed to save demographics');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCharacters = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-characters`,
        {},
        { withCredentials: true }
      );
      setCharacters(response.data.characters);
      toast.success('Characters generated!');
    } catch (error) {
      console.error('Error generating characters:', error);
      toast.error('Failed to generate characters');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectCharacter = async (url: string) => {
    if (!session) return;
    setSelectedCharacter(url);
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/select-character`,
        { characterUrl: url },
        { withCredentials: true }
      );
      setCurrentStep(2);
    } catch (error) {
      console.error('Error selecting character:', error);
    }
  };

  const handleGenerateProductImages = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-product-images`,
        {},
        { withCredentials: true }
      );
      setProductImages(response.data.images);
      toast.success('Product images generated!');
    } catch (error) {
      console.error('Error generating product images:', error);
      toast.error('Failed to generate product images');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectProductImage = async (url: string) => {
    if (!session) return;
    setSelectedProductImage(url);
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/select-product-image`,
        { imageUrl: url },
        { withCredentials: true }
      );
      setCurrentStep(3);
    } catch (error) {
      console.error('Error selecting product image:', error);
    }
  };

  const handleUpdateScenes = async () => {
    if (!session) return;
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/scenes`,
        { scenes },
        { withCredentials: true }
      );
    } catch (error) {
      console.error('Error updating scenes:', error);
    }
  };

  const handleGenerateVideo = async () => {
    if (!session) return;
    setCurrentStep(4);
    setVideoStatus('generating');
    setVideoProgress(0);
    try {
      await axios.post(
        `/api/ugc/sessions/${session.id}/generate-video`,
        {},
        { withCredentials: true }
      );
      toast.success('Video generation started!');
    } catch (error) {
      console.error('Error starting video generation:', error);
      toast.error('Failed to start video generation');
      setVideoStatus('failed');
    }
  };

  const moveScene = (index: number, direction: 'up' | 'down') => {
    const newScenes = [...scenes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= scenes.length) return;
    [newScenes[index], newScenes[targetIndex]] = [newScenes[targetIndex], newScenes[index]];
    setScenes(newScenes);
  };

  const updateScenePrompt = (index: number, prompt: string) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], prompt };
    setScenes(newScenes);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Completed</span>;
      case 'generating':
        return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">In Progress</span>;
      default:
        return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">Draft</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <Loader className="h-12 w-12 text-purple-500 animate-spin" />
        </div>
      </div>
    );
  }

  // Session Picker Modal
  if (showSessionPicker) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate('/products')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Creative Studio</h1>
              <p className="text-gray-400">{product?.title}</p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Your Creative Sessions</h2>
              <button
                onClick={createNewSession}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-all"
              >
                <Plus className="h-4 w-4" />
                New Session
              </button>
            </div>

            {allSessions.length === 0 ? (
              <div className="text-center py-12">
                <Wand2 className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-6">No creative sessions yet for this product</p>
                <button
                  onClick={createNewSession}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 mx-auto"
                >
                  <Plus className="h-5 w-5" />
                  Start Your First Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {allSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSessionData(s)}
                    className="w-full flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                        {s.status === 'completed' ? (
                          <Check className="h-6 w-6 text-green-400" />
                        ) : (
                          <Wand2 className="h-6 w-6 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-medium">
                            {s.targetDemographic 
                              ? `${s.targetDemographic.ageGroup} • ${s.targetDemographic.gender} • ${s.targetDemographic.tone}`
                              : 'New Session'
                            }
                          </span>
                          {getStatusBadge(s.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(s.updatedAt || s.createdAt)}
                          <span className="text-gray-500">•</span>
                          <span>Step {s.currentStep + 1} of {STEPS.length}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />

      {/* Back Confirmation Modal */}
      {showBackConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 text-yellow-400 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Go Back to Edit?</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Going back to <span className="text-white font-medium">{STEPS[pendingStep || 0]?.name}</span> will 
              require you to regenerate all subsequent steps. Your progress from that point onwards will be reset.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBackConfirm(false);
                  setPendingStep(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmGoBack}
                className="flex-1 px-4 py-2 bg-yellow-500 text-black font-medium rounded-lg hover:bg-yellow-400 transition-all"
              >
                Yes, Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSessionPicker(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Creative Studio</h1>
              <p className="text-gray-400">{product?.title}</p>
            </div>
          </div>
          <button
            onClick={() => setShowSessionPicker(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all text-sm"
          >
            <Clock className="h-4 w-4" />
            All Sessions
          </button>
        </div>

        {/* Progress Steps - Now Clickable */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              const isClickable = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => isClickable && handleStepClick(step.id)}
                    disabled={!isClickable}
                    className={`flex flex-col items-center transition-all ${
                      isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-green-500 text-white hover:bg-green-400'
                          : isCurrent
                          ? 'bg-purple-500 text-white ring-4 ring-purple-500/30'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {isCompleted ? <Check className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span className={`mt-2 text-sm ${
                      isCurrent ? 'text-white font-medium' : 
                      isClickable ? 'text-green-400' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </span>
                    {isClickable && (
                      <span className="text-xs text-gray-500 mt-0.5">Click to edit</span>
                    )}
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={`w-full h-1 mx-2 rounded ${
                      currentStep > step.id ? 'bg-green-500' : 'bg-gray-700'
                    }`} style={{ width: '60px' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-gray-800 rounded-2xl p-8 min-h-[500px]">
          {/* Step 0: Target Audience */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Define Your Target Audience</h2>
                <p className="text-gray-400">Help us create content that resonates with your ideal customer.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Age Group */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Age Group</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.ageGroups?.map((age: string) => (
                      <button
                        key={age}
                        onClick={() => setDemographics({ ...demographics, ageGroup: age })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.ageGroup === age
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {age}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.genders?.map((gender: string) => (
                      <button
                        key={gender}
                        onClick={() => setDemographics({ ...demographics, gender })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.gender === gender
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interests */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Interests (select multiple)</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.interests?.map((interest: string) => (
                      <button
                        key={interest}
                        onClick={() => {
                          const newInterests = demographics.interests.includes(interest)
                            ? demographics.interests.filter(i => i !== interest)
                            : [...demographics.interests, interest];
                          setDemographics({ ...demographics, interests: newInterests });
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.interests.includes(interest)
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Content Tone</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.tones?.map((tone: string) => (
                      <button
                        key={tone}
                        onClick={() => setDemographics({ ...demographics, tone })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.tone === tone
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleStep0Submit}
                  disabled={generating || demographics.interests.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {generating ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      Generating Prompts...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Character Generation */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Choose Your Character</h2>
                <p className="text-gray-400">Select a character that best represents your brand ambassador.</p>
              </div>

              {characters.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-6">Generate AI characters based on your target audience</p>
                  <button
                    onClick={handleGenerateCharacters}
                    disabled={generating}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 mx-auto"
                  >
                    {generating ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Generating Characters...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-5 w-5" />
                        Generate Characters
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {characters.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => handleSelectCharacter(char.url)}
                        className={`relative rounded-xl overflow-hidden aspect-square group ${
                          selectedCharacter === char.url ? 'ring-4 ring-purple-500' : ''
                        }`}
                      >
                        <img src={char.url} alt="Character" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-medium">Select</span>
                        </div>
                        {selectedCharacter === char.url && (
                          <div className="absolute top-2 right-2 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                            <Check className="h-5 w-5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={handleGenerateCharacters}
                      disabled={generating}
                      className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Product Images */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Product Reference Image</h2>
                <p className="text-gray-400">Select an image showing the character with your product.</p>
              </div>

              {productImages.length === 0 ? (
                <div className="text-center py-12">
                  <Image className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-6">Generate product reference images</p>
                  <button
                    onClick={handleGenerateProductImages}
                    disabled={generating}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 mx-auto"
                  >
                    {generating ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Generating Images...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-5 w-5" />
                        Generate Product Images
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {productImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => handleSelectProductImage(img.url)}
                        className={`relative rounded-xl overflow-hidden aspect-square group ${
                          selectedProductImage === img.url ? 'ring-4 ring-purple-500' : ''
                        }`}
                      >
                        <img src={img.url} alt="Product" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-medium">Select</span>
                        </div>
                        {selectedProductImage === img.url && (
                          <div className="absolute top-2 right-2 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                            <Check className="h-5 w-5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={handleGenerateProductImages}
                      disabled={generating}
                      className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Scene Editor */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Edit Your Scenes</h2>
                <p className="text-gray-400">Customize and reorder the scenes for your video.</p>
              </div>

              <div className="space-y-4">
                {scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="bg-gray-700/50 rounded-xl p-4 border border-gray-600"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => moveScene(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-white">
                            Scene {index + 1}: {scene.title}
                          </h3>
                          <span className="text-sm text-gray-400">{scene.duration}s</span>
                        </div>
                        <textarea
                          value={scene.prompt}
                          onChange={(e) => updateScenePrompt(index, e.target.value)}
                          onBlur={handleUpdateScenes}
                          className="w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none"
                          rows={2}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => moveScene(index, 'up')}
                          disabled={index === 0}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveScene(index, 'down')}
                          disabled={index === scenes.length - 1}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleGenerateVideo}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
                >
                  <Play className="h-5 w-5" />
                  Generate Video
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Video Generation */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  {videoStatus === 'completed' ? 'Your Video is Ready!' : 'Generating Your Video'}
                </h2>
                <p className="text-gray-400">
                  {videoStatus === 'completed' 
                    ? 'Download and share your creative content.'
                    : 'Please wait while we create your video...'}
                </p>
              </div>

              {videoStatus === 'generating' && (
                <div className="py-12">
                  <div className="max-w-md mx-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">Progress</span>
                      <span className="text-white font-medium">{videoProgress}%</span>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                    <div className="mt-4 text-center">
                      <Loader className="h-8 w-8 text-purple-500 animate-spin mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">
                        {videoProgress < 25 && 'Preparing assets...'}
                        {videoProgress >= 25 && videoProgress < 50 && 'Generating scenes...'}
                        {videoProgress >= 50 && videoProgress < 75 && 'Rendering video...'}
                        {videoProgress >= 75 && videoProgress < 100 && 'Finalizing...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {videoStatus === 'completed' && videoUrl && (
                <div className="py-8">
                  <div className="max-w-2xl mx-auto">
                    <div className="aspect-video bg-black rounded-xl overflow-hidden mb-6">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full h-full"
                        poster={product?.imageUrl}
                      />
                    </div>
                    <div className="flex justify-center gap-4">
                      <a
                        href={videoUrl}
                        download
                        className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-all"
                      >
                        <Download className="h-5 w-5" />
                        Download Video
                      </a>
                      <button
                        onClick={() => setShowSessionPicker(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-all"
                      >
                        View All Sessions
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {videoStatus === 'failed' && (
                <div className="py-12 text-center">
                  <p className="text-red-400 mb-4">Video generation failed. Please try again.</p>
                  <button
                    onClick={handleGenerateVideo}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 mx-auto"
                  >
                    <RefreshCw className="h-5 w-5" />
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreativeStudioPage;
