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
  prompt: string;      // visuals
  dialogue: string;
  motion: string;
  transitions: string; // original transitions text from LLM
  duration: number;
  imageUrl?: string;       // generated scene image
  generating?: boolean;    // loading state for image generation
  videoUrl?: string;       // generated scene video
  generatingVideo?: boolean; // loading state for video generation
  included?: boolean;      // whether to include in final video
  transitionType?: 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'circleopen' | 'none'; // transition to next scene
}

// Available transitions for video stitching
const TRANSITION_OPTIONS = [
  { value: 'fade', label: '✨ Fade' },
  { value: 'dissolve', label: '🌊 Dissolve' },
  { value: 'wipeleft', label: '👈 Wipe Left' },
  { value: 'wiperight', label: '👉 Wipe Right' },
  { value: 'slideup', label: '⬆️ Slide Up' },
  { value: 'circleopen', label: '⭕ Circle Open' },
  { value: 'none', label: '🚫 None (Cut)' },
];

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
  
  // Generated Prompts (from LLM)
  const [productPrompt, setProductPrompt] = useState<string>('');
  const [productBreakdown, setProductBreakdown] = useState<string>('');
  const [characterPrompt, setCharacterPrompt] = useState<string>('');
  const [videoAdOutput, setVideoAdOutput] = useState<any>(null);
  
  // Step 4: Video
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('draft');
  const [stitchingStage, setStitchingStage] = useState<string>('');
  const [stitchingMessage, setStitchingMessage] = useState<string>('');

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
          
          // Update stitching stage and message if available
          if (response.data.stage) {
            setStitchingStage(response.data.stage);
          }
          if (response.data.message) {
            setStitchingMessage(response.data.message);
          }
          
          if (response.data.videoUrl) {
            setVideoUrl(response.data.videoUrl);
          }
          if (response.data.status === 'completed') {
            clearInterval(interval);
            toast.success('Video stitched successfully!');
          }
          if (response.data.status === 'failed') {
            clearInterval(interval);
            toast.error('Video stitching failed');
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

  // Normalize session data to handle both camelCase and snake_case
  const normalizeSession = (s: any): UgcSession => ({
    id: s.id,
    productId: s.productId || s.product_id,
    targetDemographic: s.targetDemographic || s.target_demographic,
    productPrompt: s.productPrompt || s.product_prompt || '',
    characterPrompt: s.characterPrompt || s.character_prompt || '',
    scenes: s.scenes || [],
    generatedCharacters: s.generatedCharacters || s.generated_characters || [],
    selectedCharacter: s.selectedCharacter || s.selected_character || '',
    generatedProductImages: s.generatedProductImages || s.generated_product_images || [],
    selectedProductImage: s.selectedProductImage || s.selected_product_image || '',
    editedScenes: s.editedScenes || s.edited_scenes || [],
    videoUrl: s.videoUrl || s.video_url || '',
    videoProgress: s.videoProgress || s.video_progress || 0,
    currentStep: s.currentStep ?? s.current_step ?? 0,
    status: s.status || 'draft',
    createdAt: s.createdAt || s.created_at || '',
    updatedAt: s.updatedAt || s.updated_at || ''
  });

  const loadSessions = async () => {
    setLoading(true);
    try {
      const sessionsResponse = await axios.get('/api/ugc/sessions', { withCredentials: true });
      // Normalize and filter sessions for this product
      const normalizedSessions = sessionsResponse.data.sessions.map(normalizeSession);
      const productSessions = normalizedSessions.filter(
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

  const loadSessionData = (sessionData: any) => {
    // Normalize the session data first
    const normalized = normalizeSession(sessionData);
    setSession(normalized);
    
    // Set all state from normalized data
    setCurrentStep(normalized.currentStep);
    
    // Merge scenes: use edited scenes but fill in missing fields from original
    const originalScenes = normalized.scenes || [];
    const editedScenes = normalized.editedScenes || [];
    
    if (editedScenes.length > 0) {
      // Merge edited scenes with original to preserve dialogue, motion, transitions
      const mergedScenes = editedScenes.map((edited: Scene, index: number) => ({
        // Start with original scene data (has dialogue, motion, transitions from LLM)
        ...(originalScenes[index] || {}),
        // Override with edited values (user's changes to prompt, etc.)
        ...edited,
      }));
      setScenes(mergedScenes);
    } else if (originalScenes.length > 0) {
      setScenes(originalScenes);
    }
    if (normalized.generatedCharacters?.length > 0) setCharacters(normalized.generatedCharacters);
    if (normalized.selectedCharacter) setSelectedCharacter(normalized.selectedCharacter);
    if (normalized.generatedProductImages?.length > 0) setProductImages(normalized.generatedProductImages);
    if (normalized.selectedProductImage) setSelectedProductImage(normalized.selectedProductImage);
    if (normalized.targetDemographic) setDemographics(normalized.targetDemographic);
    if (normalized.productPrompt) setProductPrompt(normalized.productPrompt);
    
    // Handle additional fields that may not be in the interface
    const prodBreakdown = sessionData.productBreakdown || sessionData.product_breakdown;
    if (prodBreakdown) setProductBreakdown(prodBreakdown);
    const vidAdOutput = sessionData.videoAdOutput || sessionData.video_ad_output;
    if (vidAdOutput) setVideoAdOutput(vidAdOutput);
    if (normalized.characterPrompt) setCharacterPrompt(normalized.characterPrompt);
    if (normalized.videoUrl) setVideoUrl(normalized.videoUrl);
    if (normalized.videoProgress) setVideoProgress(normalized.videoProgress);
    if (normalized.status) setVideoStatus(normalized.status);
    
    setShowSessionPicker(false);
    
    // Update furthest step based on loaded progress
    setFurthestStep(normalized.currentStep);
    
    // Update URL with session ID
    setSearchParams({ session: normalized.id });
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post('/api/ugc/sessions', { productId }, { withCredentials: true });
      const newSession = normalizeSession(response.data.session);
      setSession(newSession);
      setAllSessions(prev => [newSession, ...prev]);
      setSearchParams({ session: newSession.id });
      setCurrentStep(0);
      setCharacters([]);
      setSelectedCharacter(null);
      setProductImages([]);
      setSelectedProductImage(null);
      setScenes([]);
      setProductPrompt('');
      setProductBreakdown('');
      setCharacterPrompt('');
      setVideoAdOutput(null);
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

  // Track the furthest step reached (for detecting if going back will lose progress)
  const [furthestStep, setFurthestStep] = useState(0);

  // Update furthest step when progressing
  useEffect(() => {
    if (currentStep > furthestStep) {
      setFurthestStep(currentStep);
    }
  }, [currentStep]);

  const handleStepClick = (stepId: number) => {
    // Can navigate to any step up to and including furthestStep
    if (stepId > furthestStep) return;
    if (stepId === currentStep) return;
    
    // Just navigate - no warning needed for viewing steps
    setCurrentStep(stepId);
  };

  // Show warning before making edits that would invalidate subsequent steps
  const confirmEditInPreviousStep = (stepId: number, onConfirm: () => void) => {
    if (stepId < furthestStep) {
      // User has progressed beyond this step, show warning before editing
      setPendingStep(stepId);
      setShowBackConfirm(true);
      // Store the callback for when they confirm
      setPendingEditCallback(() => onConfirm);
    } else {
      // No progress to lose, just execute
      onConfirm();
    }
  };

  const [pendingEditCallback, setPendingEditCallback] = useState<(() => void) | null>(null);

  const confirmGoBack = async () => {
    if (pendingStep === null || !session) return;
    
    // Reset subsequent data when editing a previous step
    try {
      if (pendingStep <= 0) {
        // Editing step 0 - clear everything
        setCharacters([]);
        setSelectedCharacter(null);
        setProductImages([]);
        setSelectedProductImage(null);
        setScenes([]);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 1) {
        // Editing step 1 - clear from step 2 onwards
        setProductImages([]);
        setSelectedProductImage(null);
        setScenes([]);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 2) {
        // Editing step 2 - clear from step 3 onwards
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      } else if (pendingStep <= 3) {
        // Editing step 3 - clear video
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoStatus('draft');
      }

      // Reset furthest step to current edit point
      setFurthestStep(pendingStep);
      
      // Execute the pending edit callback if there is one
      if (pendingEditCallback) {
        pendingEditCallback();
        setPendingEditCallback(null);
      }

      setShowBackConfirm(false);
      setPendingStep(null);
      toast.success('Progress reset. You can now make changes.');
    } catch (error) {
      console.error('Error confirming edit:', error);
    }
  };

  const doStep0Submit = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const response = await axios.put(
        `/api/ugc/sessions/${session.id}/demographics`,
        { targetDemographic: demographics },
        { withCredentials: true }
      );
      // Store all LLM-generated prompts
      setProductPrompt(response.data.productPrompt || '');
      setProductBreakdown(response.data.productBreakdown || '');
      setCharacterPrompt(response.data.characterPrompt || '');
      setScenes(response.data.scenes || []);
      setVideoAdOutput(response.data.videoAdOutput || null);
      setCurrentStep(1);
      toast.success('Audience profile created!');
    } catch (error) {
      console.error('Error saving demographics:', error);
      toast.error('Failed to save demographics');
    } finally {
      setGenerating(false);
    }
  };

  // Wrapper that checks if editing step 0 would lose progress
  const handleStep0Submit = () => {
    if (furthestStep > 0) {
      confirmEditInPreviousStep(0, doStep0Submit);
    } else {
      doStep0Submit();
    }
  };

  const doGenerateCharacters = async () => {
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

  // Wrapper that checks if regenerating characters would lose progress
  const handleGenerateCharacters = () => {
    if (furthestStep > 1) {
      confirmEditInPreviousStep(1, doGenerateCharacters);
    } else {
      doGenerateCharacters();
    }
  };

  const handleSelectCharacter = (url: string) => {
    setSelectedCharacter(url);
  };

  const handleContinueFromCharacter = async () => {
    if (!session || !selectedCharacter) return;
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/select-character`,
        { characterUrl: selectedCharacter },
        { withCredentials: true }
      );
      setCurrentStep(2);
      setFurthestStep(Math.max(furthestStep, 2));
    } catch (error) {
      console.error('Error saving character selection:', error);
      toast.error('Failed to save character selection');
    }
  };

  const doGenerateProductImages = async () => {
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

  // Wrapper that checks if regenerating product images would lose progress
  const handleGenerateProductImages = () => {
    if (furthestStep > 2) {
      confirmEditInPreviousStep(2, doGenerateProductImages);
    } else {
      doGenerateProductImages();
    }
  };

  const handleSelectProductImage = (url: string) => {
    setSelectedProductImage(url);
  };

  const handleContinueFromProductImage = async () => {
    if (!session || !selectedProductImage) return;
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/select-product-image`,
        { imageUrl: selectedProductImage },
        { withCredentials: true }
      );
      setCurrentStep(3);
      setFurthestStep(Math.max(furthestStep, 3));
    } catch (error) {
      console.error('Error saving product image selection:', error);
      toast.error('Failed to save product image selection');
    }
  };

  const handleUpdateScenes = async (updatedScenes?: Scene[]) => {
    if (!session) return;
    const scenesToSave = updatedScenes || scenes;
    try {
      await axios.put(
        `/api/ugc/sessions/${session.id}/scenes`,
        { scenes: scenesToSave },
        { withCredentials: true }
      );
    } catch (error) {
      console.error('Error updating scenes:', error);
    }
  };

  const handleGenerateVideo = async () => {
    if (!session) return;
    
    // Check if we have any scenes with videos
    const scenesWithVideos = scenes.filter(s => s.videoUrl && s.included !== false);
    if (scenesWithVideos.length === 0) {
      toast.error('Please generate videos for at least one scene first');
      return;
    }

    setCurrentStep(4);
    setVideoStatus('generating');
    setVideoProgress(0);
    setStitchingStage('downloading');
    setStitchingMessage('Preparing to stitch videos...');
    
    try {
      // Prepare scenes data with video URLs and transitions
      const scenesData = scenes
        .filter(s => s.included !== false)
        .map((scene, index) => ({
          videoUrl: scene.videoUrl,
          transition: scene.transitionType || 'fade',
          duration: scene.duration || 4,
          includeInFinal: scene.included !== false
        }));

      await axios.post(
        `/api/ugc/sessions/${session.id}/generate-video`,
        { scenes: scenesData },
        { withCredentials: true }
      );
      toast.success('Video stitching started!');
    } catch (error: any) {
      console.error('Error starting video generation:', error);
      const errorMessage = error.response?.data?.error || 'Failed to start video generation';
      toast.error(errorMessage);
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

  const updateSceneDialogue = (index: number, dialogue: string) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], dialogue };
    setScenes(newScenes);
  };

  const updateSceneMotion = (index: number, motion: string) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], motion };
    setScenes(newScenes);
  };

  const updateSceneTransitions = (index: number, transitions: string) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], transitions };
    setScenes(newScenes);
  };

  const updateSceneTransitionType = (index: number, transitionType: Scene['transitionType']) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], transitionType };
    setScenes(newScenes);
    // Auto-save the transition type
    handleUpdateScenes(newScenes);
  };

  const toggleSceneIncluded = (index: number) => {
    const newScenes = [...scenes];
    // Default to true if undefined, then toggle
    const currentValue = newScenes[index].included !== false;
    newScenes[index] = { ...newScenes[index], included: !currentValue };
    setScenes(newScenes);
    handleUpdateScenes();
  };

  // Auto-resize textarea helper
  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // Auto-resize all textareas when scenes load
  useEffect(() => {
    if (scenes.length > 0 && currentStep === 3) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const textareas = document.querySelectorAll('.scene-textarea');
        textareas.forEach((textarea) => {
          const el = textarea as HTMLTextAreaElement;
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        });
      }, 100);
    }
  }, [scenes, currentStep]);

  const handleGenerateSceneImage = async (index: number) => {
    if (!session) return;
    
    const scene = scenes[index];
    if (!scene.prompt) {
      toast.error('Please add a visuals prompt for this scene');
      return;
    }

    // Set generating state for this scene
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], generating: true };
    setScenes(newScenes);

    try {
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-scene-image`,
        { 
          sceneIndex: index,
          visualsPrompt: scene.prompt 
        },
        { withCredentials: true }
      );

      // Update scene with generated image
      const updatedScenes = [...scenes];
      updatedScenes[index] = { 
        ...updatedScenes[index], 
        imageUrl: response.data.imageUrl,
        generating: false 
      };
      setScenes(updatedScenes);
      
      // Save to backend (pass updated scenes to avoid stale closure)
      await handleUpdateScenes(updatedScenes);
      toast.success(`Scene ${index + 1} image generated!`);
    } catch (error) {
      console.error('Error generating scene image:', error);
      toast.error('Failed to generate scene image');
      
      // Reset generating state
      const updatedScenes = [...scenes];
      updatedScenes[index] = { ...updatedScenes[index], generating: false };
      setScenes(updatedScenes);
    }
  };

  const handleGenerateSceneVideo = async (index: number) => {
    if (!session) return;
    
    const scene = scenes[index];
    if (!scene.imageUrl) {
      toast.error('Please generate a scene image first');
      return;
    }

    // Set generating state for video
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], generatingVideo: true };
    setScenes(newScenes);

    try {
      // Build a comprehensive prompt from scene data
      const videoPrompt = `${scene.prompt}. Motion: ${scene.motion || 'smooth movement'}. The character says: "${scene.dialogue || ''}"`;
      
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-scene-video`,
        { 
          sceneIndex: index,
          prompt: videoPrompt,
          imageUrl: scene.imageUrl
        },
        { withCredentials: true }
      );

      // Update scene with generated video
      const updatedScenes = [...scenes];
      updatedScenes[index] = { 
        ...updatedScenes[index], 
        videoUrl: response.data.videoUrl,
        generatingVideo: false 
      };
      setScenes(updatedScenes);
      
      // Save to backend (pass updated scenes to avoid stale closure)
      await handleUpdateScenes(updatedScenes);
      toast.success(`Scene ${index + 1} video generated!`);
    } catch (error) {
      console.error('Error generating scene video:', error);
      toast.error('Failed to generate scene video');
      
      // Reset generating state
      const updatedScenes = [...scenes];
      updatedScenes[index] = { ...updatedScenes[index], generatingVideo: false };
      setScenes(updatedScenes);
    }
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
              <h3 className="text-lg font-semibold">Reset Progress?</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Making changes to <span className="text-white font-medium">{STEPS[pendingStep || 0]?.name}</span> will 
              reset all subsequent steps. You'll need to regenerate from this point onwards.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBackConfirm(false);
                  setPendingStep(null);
                  setPendingEditCallback(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmGoBack}
                className="flex-1 px-4 py-2 bg-yellow-500 text-black font-medium rounded-lg hover:bg-yellow-400 transition-all"
              >
                Yes, Continue
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
              const isCompleted = furthestStep > step.id;
              const isCurrent = currentStep === step.id;
              const isClickable = step.id <= furthestStep && step.id !== currentStep;
              
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
                        isCurrent
                          ? 'bg-purple-500 text-white ring-4 ring-purple-500/30'
                          : isCompleted
                          ? 'bg-green-500 text-white hover:bg-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {isCompleted && !isCurrent ? <Check className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span className={`mt-2 text-sm ${
                      isCurrent ? 'text-white font-medium' : 
                      isCompleted ? 'text-green-400' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </span>
                    {isClickable && (
                      <span className="text-xs text-gray-500 mt-0.5">Click to view</span>
                    )}
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={`w-full h-1 mx-2 rounded ${
                      furthestStep > step.id ? 'bg-green-500' : 'bg-gray-700'
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

              {/* Generated Prompts Display */}
              {(productPrompt || characterPrompt || productBreakdown || videoAdOutput) && (
                <div className="space-y-4">
                  {/* Product Breakdown (String) */}
                  {productBreakdown && (
                    <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-5 border border-purple-500/30">
                      <h4 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
                        📊 Product Analysis (AI Generated)
                      </h4>
                      <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {productBreakdown}
                      </div>
                    </div>
                  )}

                  {/* Customer Avatar from Video Ad Output */}
                  {videoAdOutput?.customer_avatar && (
                    <div className="bg-gradient-to-r from-pink-900/30 to-orange-900/30 rounded-xl p-5 border border-pink-500/30">
                      <h4 className="text-sm font-semibold text-pink-300 mb-4 flex items-center gap-2">
                        👤 Customer Avatar
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h5 className="text-pink-400 font-medium mb-1">{videoAdOutput.customer_avatar.name}</h5>
                          <p className="text-gray-400 text-xs mb-2">{videoAdOutput.customer_avatar.demographics}</p>
                          <p className="text-gray-300">{videoAdOutput.customer_avatar.backstory}</p>
                        </div>
                        <div>
                          <h5 className="text-orange-400 font-medium mb-1">Visual Description</h5>
                          <p className="text-gray-300 text-xs">{videoAdOutput.customer_avatar.visual_description}</p>
                        </div>
                      </div>
                      {videoAdOutput.video_ad_script?.overall_tone && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                          <span className="text-xs text-gray-400">Ad Tone: </span>
                          <span className="text-xs text-purple-300 font-medium">{videoAdOutput.video_ad_script.overall_tone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product & Character Prompts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {productPrompt && (
                      <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
                        <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                          <Wand2 className="h-4 w-4" />
                          Marketing Prompt
                        </h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{productPrompt}</p>
                      </div>
                    )}
                    {characterPrompt && (
                      <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600">
                        <h4 className="text-sm font-medium text-pink-400 mb-2 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Character Prompt
                        </h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{characterPrompt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                    <button
                      onClick={handleContinueFromCharacter}
                      disabled={!selectedCharacter}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Continue
                      <ArrowRight className="h-5 w-5" />
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
                    <button
                      onClick={handleContinueFromProductImage}
                      disabled={!selectedProductImage}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Continue
                      <ArrowRight className="h-5 w-5" />
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

              <div className="space-y-6">
                {scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="bg-gray-700/50 rounded-xl p-5 border border-gray-600"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-1 pt-1">
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
                      <div className={`flex-1 space-y-4 ${scene.included === false ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Include Toggle */}
                            <button
                              onClick={() => toggleSceneIncluded(index)}
                              className={`relative w-12 h-6 rounded-full transition-colors ${
                                scene.included !== false ? 'bg-purple-500' : 'bg-gray-600'
                              }`}
                            >
                              <span
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                  scene.included !== false ? 'left-7' : 'left-1'
                                }`}
                              />
                            </button>
                            <h3 className="font-semibold text-white text-lg">
                              Scene {index + 1}: {scene.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {scene.included === false && (
                              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">Excluded</span>
                            )}
                            <span className="text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-full">{scene.duration}s</span>
                          </div>
                        </div>
                        
                        {/* Visuals */}
                        <div>
                          <label className="block text-sm font-medium text-purple-400 mb-1.5">
                            Visuals
                          </label>
                          <textarea
                            value={scene.prompt}
                            onChange={(e) => { updateScenePrompt(index, e.target.value); autoResize(e); }}
                            onBlur={handleUpdateScenes}
                            onFocus={(e) => autoResize(e as any)}
                            className="scene-textarea w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none overflow-hidden"
                            style={{ minHeight: '60px' }}
                          />
                        </div>

                        {/* Dialogue */}
                        <div>
                          <label className="block text-sm font-medium text-pink-400 mb-1.5">
                            Dialogue
                          </label>
                          <textarea
                            value={scene.dialogue || ''}
                            onChange={(e) => { updateSceneDialogue(index, e.target.value); autoResize(e); }}
                            onBlur={handleUpdateScenes}
                            onFocus={(e) => autoResize(e as any)}
                            className="scene-textarea w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none resize-none overflow-hidden"
                            style={{ minHeight: '60px' }}
                            placeholder="Enter dialogue for this scene..."
                          />
                        </div>

                        {/* Motion & Transitions */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-blue-400 mb-1.5">
                              Motion
                            </label>
                            <input
                              type="text"
                              value={scene.motion || ''}
                              onChange={(e) => updateSceneMotion(index, e.target.value)}
                              onBlur={handleUpdateScenes}
                              className="w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              placeholder="Camera movement..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-orange-400 mb-1.5">
                              Transition Notes
                            </label>
                            <input
                              type="text"
                              value={scene.transitions || ''}
                              onChange={(e) => updateSceneTransitions(index, e.target.value)}
                              onBlur={handleUpdateScenes}
                              className="w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                              placeholder="Transition type..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-green-400 mb-1.5">
                              Video Transition {index < scenes.length - 1 ? '→ Next' : '(End)'}
                            </label>
                            <select
                              value={scene.transitionType || 'fade'}
                              onChange={(e) => updateSceneTransitionType(index, e.target.value as Scene['transitionType'])}
                              disabled={index === scenes.length - 1}
                              className="w-full bg-gray-800 text-gray-200 rounded-lg p-3 text-sm border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none disabled:opacity-50"
                            >
                              {TRANSITION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Scene Image & Generate Button */}
                        <div className="pt-4 border-t border-gray-600">
                          <div className="flex items-start gap-4">
                            {/* Generated Image */}
                            {scene.imageUrl && (
                              <div className="w-32 h-32 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600">
                                <img 
                                  src={scene.imageUrl} 
                                  alt={`Scene ${index + 1}`} 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            
                            {/* Generate Buttons */}
                            <div className="flex-1 space-y-3">
                              {/* Generate Scene Image Button */}
                              <div>
                                <button
                                  onClick={() => handleGenerateSceneImage(index)}
                                  disabled={scene.generating || !scene.prompt}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {scene.generating ? (
                                    <>
                                      <Loader className="h-4 w-4 animate-spin" />
                                      Generating Image...
                                    </>
                                  ) : (
                                    <>
                                      <Wand2 className="h-4 w-4" />
                                      {scene.imageUrl ? 'Regenerate Image' : 'Generate Image'}
                                    </>
                                  )}
                                </button>
                              </div>
                              
                              {/* Generate Scene Video Button - only enabled after image exists */}
                              <div>
                                <button
                                  onClick={() => handleGenerateSceneVideo(index)}
                                  disabled={!scene.imageUrl || scene.generatingVideo}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {scene.generatingVideo ? (
                                    <>
                                      <Loader className="h-4 w-4 animate-spin" />
                                      Generating Video...
                                    </>
                                  ) : (
                                    <>
                                      <Film className="h-4 w-4" />
                                      {scene.videoUrl ? 'Regenerate Video' : 'Generate Video'}
                                    </>
                                  )}
                                </button>
                                {!scene.imageUrl && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Generate scene image first
                                  </p>
                                )}
                              </div>

                              {/* Show video preview if generated */}
                              {scene.videoUrl && (
                                <div className="mt-2">
                                  <video 
                                    src={scene.videoUrl} 
                                    controls 
                                    className="w-full max-w-xs rounded-lg border border-gray-600"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary & Generate Button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                  <span className="text-green-400 font-medium">
                    {scenes.filter(s => s.videoUrl && s.included !== false).length}
                  </span>
                  {' / '}
                  <span>{scenes.filter(s => s.included !== false).length}</span>
                  {' scenes ready for stitching'}
                  {scenes.filter(s => s.videoUrl && s.included !== false).length > 0 && (
                    <span className="ml-3 text-gray-500">
                      (Transitions: {scenes.filter(s => s.included !== false).map(s => s.transitionType || 'fade').slice(0, -1).join(' → ')})
                    </span>
                  )}
                </div>
                <button
                  onClick={handleGenerateVideo}
                  disabled={scenes.filter(s => s.videoUrl && s.included !== false).length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="h-5 w-5" />
                  Stitch Videos ({scenes.filter(s => s.videoUrl && s.included !== false).length} scenes)
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
                    {/* Stage indicator */}
                    <div className="flex justify-center gap-2 mb-6">
                      {['downloading', 'processing', 'stitching', 'uploading'].map((stage, idx) => (
                        <div key={stage} className="flex items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            stitchingStage === stage 
                              ? 'bg-purple-500 text-white animate-pulse' 
                              : ['downloading', 'processing', 'stitching', 'uploading'].indexOf(stitchingStage) > idx
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-700 text-gray-400'
                          }`}>
                            {['downloading', 'processing', 'stitching', 'uploading'].indexOf(stitchingStage) > idx ? '✓' : idx + 1}
                          </div>
                          {idx < 3 && <div className="w-8 h-0.5 bg-gray-700 mx-1" />}
                        </div>
                      ))}
                    </div>
                    
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
                        {stitchingMessage || (
                          <>
                            {stitchingStage === 'downloading' && '📥 Downloading scene videos...'}
                            {stitchingStage === 'processing' && '⚙️ Preparing video segments...'}
                            {stitchingStage === 'stitching' && '🎬 Stitching videos with transitions...'}
                            {stitchingStage === 'uploading' && '☁️ Uploading final video...'}
                            {!stitchingStage && 'Starting video stitching...'}
                          </>
                        )}
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        Combining {scenes.filter(s => s.videoUrl && s.included !== false).length} scenes
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
