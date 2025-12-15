import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { 
  ArrowLeft, ArrowRight, Check, Loader, Users, Image, Film, 
  Wand2, GripVertical, Play, Download, RefreshCw, Plus, Clock, 
  AlertTriangle, X, FileText, Edit2, Save, Filter, Search, ArrowUpDown, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
}

interface SceneImage {
  url: string;
  isNew?: boolean;      // marks newly generated images
  createdAt: Date;
}

interface SceneVideo {
  url: string;
  isNew?: boolean;      // marks newly generated videos
  createdAt: Date;
}

interface StitchedVideo {
  url: string;
  isNew?: boolean;
  createdAt: Date;
  sceneCount: number;   // number of scenes included
}

interface Scene {
  id: number;
  title: string;
  prompt: string;      // visuals
  dialogue: string;
  motion: string;
  transitions: string; // original transitions text from LLM
  duration: number;
  imageUrl?: string;       // legacy: single image URL (for backward compatibility)
  images?: SceneImage[];   // array of generated images
  selectedImageIndex?: number; // index of selected image in images array
  generating?: boolean;    // loading state for image generation
  videoUrl?: string;       // legacy: single video URL (for backward compatibility)
  videos?: SceneVideo[];   // array of generated videos
  selectedVideoIndex?: number; // index of selected video in videos array
  generatingVideo?: boolean; // loading state for video generation
  videoProgress?: number;    // 0-100 progress for video generation
  videoStatus?: 'queued' | 'generating' | 'completed' | 'failed';
  videoError?: string;       // error message if failed
  included?: boolean;      // whether to include in final video
  transitionType?: 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'circleopen' | 'none'; // transition to next scene
}

// Helper to get the selected image URL from a scene
const getSelectedImageUrl = (scene: Scene): string | undefined => {
  if (scene.images && scene.images.length > 0) {
    const selectedIndex = scene.selectedImageIndex ?? 0;
    return scene.images[selectedIndex]?.url;
  }
  return scene.imageUrl; // fallback to legacy field
};

// Helper to get the selected video URL from a scene
const getSelectedVideoUrl = (scene: Scene): string | undefined => {
  if (scene.videos && scene.videos.length > 0) {
    const selectedIndex = scene.selectedVideoIndex ?? 0;
    return scene.videos[selectedIndex]?.url;
  }
  return scene.videoUrl; // fallback to legacy field
};

interface SceneVideoJob {
  id: string;
  sceneIndex: number;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  errorMessage?: string;
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
  title?: string;
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
  
  // Edit title state
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<UgcSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'status' | 'time'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Confirmation modal for going back
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  
  // Step 0: Demographics
  const [demographics, setDemographics] = useState({
    ageGroup: '25-34',
    gender: 'All',
    interests: ['Technology', 'Lifestyle'],
    tone: 'Casual',
    countries: [] as string[]
  });
  
  // Country typeahead state
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  
  // Comprehensive list of countries
  const allCountries = [
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
    'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
    'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
    'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
    'Denmark', 'Djibouti', 'Dominican Republic',
    'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
    'Fiji', 'Finland', 'France',
    'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guyana',
    'Haiti', 'Honduras', 'Hungary',
    'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
    'Jamaica', 'Japan', 'Jordan',
    'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan',
    'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
    'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
    'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
    'Oman',
    'Pakistan', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
    'Qatar',
    'Romania', 'Russia', 'Rwanda',
    'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
    'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
    'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
    'Venezuela', 'Vietnam',
    'Yemen',
    'Zambia', 'Zimbabwe'
  ];
  
  const filteredCountries = allCountries.filter(
    country => 
      country.toLowerCase().includes(countrySearch.toLowerCase()) &&
      !demographics.countries.includes(country)
  );
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
  const [stitchedVideos, setStitchedVideos] = useState<StitchedVideo[]>([]);
  const [selectedStitchedVideoIndex, setSelectedStitchedVideoIndex] = useState(0);
  const [stitchingStage, setStitchingStage] = useState<string>('');
  const [stitchingMessage, setStitchingMessage] = useState<string>('');
  const [creatingPost, setCreatingPost] = useState(false);

  useEffect(() => {
    fetchProduct();
    fetchDemographicOptions();
  }, [productId]);

  useEffect(() => {
    if (product) {
      loadSessions();
    }
  }, [product]);

  // Poll for video stitching progress (Step 4)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
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
            
            // Fetch fresh session data to get complete stitched_videos array
            try {
              const freshSessionResponse = await axios.get(`/api/ugc/sessions/${session.id}`, { withCredentials: true });
              const freshSessionData = freshSessionResponse.data.session;
              const videos = freshSessionData.stitched_videos || freshSessionData.stitchedVideos || [];
              
              if (videos.length > 0) {
                // Update stitchedVideos with fresh data from DB
                setStitchedVideos(videos.map((v: any, idx: number) => ({
                  url: v.url,
                  isNew: idx === 0, // Mark first (newest) as new
                  createdAt: new Date(v.createdAt || v.created_at || Date.now()),
                  sceneCount: v.sceneCount || v.scene_count || 0
                })));
                setSelectedStitchedVideoIndex(0);
                
                // Update videoUrl with the latest
                if (freshSessionData.video_url || freshSessionData.videoUrl) {
                  setVideoUrl(freshSessionData.video_url || freshSessionData.videoUrl);
                }
              } else if (response.data.videoUrl) {
                // Fallback: use videoUrl from progress response if no stitched_videos
                setStitchedVideos(prev => {
                  if (prev.some(v => v.url === response.data.videoUrl)) {
                    return prev;
                  }
                  const updatedPrev = prev.map(v => ({ ...v, isNew: false }));
                  const newVideo: StitchedVideo = {
                    url: response.data.videoUrl,
                    isNew: true,
                    createdAt: new Date(),
                    sceneCount: scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false).length
                  };
                  return [newVideo, ...updatedPrev];
                });
                setSelectedStitchedVideoIndex(0);
              }
              
              toast.success('Video stitched successfully!');
            } catch (fetchError) {
              console.error('Error fetching fresh session:', fetchError);
              // Fallback to using response data
              if (response.data.videoUrl) {
                setVideoUrl(response.data.videoUrl);
                setStitchedVideos(prev => {
                  if (prev.some(v => v.url === response.data.videoUrl)) {
                    return prev;
                  }
                  const updatedPrev = prev.map(v => ({ ...v, isNew: false }));
                  const newVideo: StitchedVideo = {
                    url: response.data.videoUrl,
                    isNew: true,
                    createdAt: new Date(),
                    sceneCount: scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false).length
                  };
                  return [newVideo, ...updatedPrev];
                });
                setSelectedStitchedVideoIndex(0);
              }
              toast.success('Video stitched successfully!');
            }
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

  // Poll for scene video generation status (Step 3)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    // Check if any scene is currently generating
    const hasGeneratingScenes = scenes.some(
      s => s.generatingVideo || s.videoStatus === 'queued' || s.videoStatus === 'generating'
    );
    
    if (session && currentStep === 3 && hasGeneratingScenes) {
      // Poll immediately, then every 3 seconds
      pollSceneVideoStatus();
      interval = setInterval(pollSceneVideoStatus, 3000);
    }
    
    return () => clearInterval(interval);
  }, [session, currentStep, scenes.some(s => s.generatingVideo || s.videoStatus === 'queued' || s.videoStatus === 'generating')]);

  // Also poll on page load if we're on step 3 to restore generating state
  useEffect(() => {
    if (session && currentStep === 3) {
      pollSceneVideoStatus();
    }
  }, [session, currentStep]);

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
        // First try to find in filtered sessions
        let targetSession = productSessions.find((s: UgcSession) => s.id === sessionId);
        
        // If not found, try to fetch directly from API
        if (!targetSession) {
          console.log('Session not in filtered list, fetching directly...');
          console.log('Looking for session:', sessionId);
          console.log('Product ID from URL:', productId);
          console.log('Available sessions:', productSessions.map((s: UgcSession) => ({ id: s.id, productId: s.productId })));
          
          try {
            const directResponse = await axios.get(`/api/ugc/sessions/${sessionId}`, { withCredentials: true });
            if (directResponse.data.session) {
              const fetchedSession = normalizeSession(directResponse.data.session);
              console.log('Fetched session productId:', fetchedSession.productId);
              
              // Check if it matches the current product
              if (fetchedSession.productId === productId) {
                targetSession = fetchedSession;
                // Add to sessions list
                setAllSessions([...productSessions, fetchedSession]);
              } else {
                console.log('Session belongs to different product, redirecting...');
                // Optionally redirect to correct product
                toast.error(`This session belongs to a different product`);
                setShowSessionPicker(true);
                return;
              }
            }
          } catch (fetchError) {
            console.error('Failed to fetch session directly:', fetchError);
          }
        }
        
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
    
    // Helper to migrate legacy imageUrl/videoUrl to arrays
    const migrateSceneMedia = (scene: Scene): Scene => {
      let migrated = { ...scene };
      
      // Migrate imageUrl to images array
      if (scene.imageUrl && (!scene.images || scene.images.length === 0)) {
        migrated = {
          ...migrated,
          images: [{
            url: scene.imageUrl,
            isNew: false,
            createdAt: new Date()
          }],
          selectedImageIndex: 0
        };
      }
      
      // Migrate videoUrl to videos array
      if (scene.videoUrl && (!scene.videos || scene.videos.length === 0)) {
        migrated = {
          ...migrated,
          videos: [{
            url: scene.videoUrl,
            isNew: false,
            createdAt: new Date()
          }],
          selectedVideoIndex: 0
        };
      }
      
      return migrated;
    };
    
    if (editedScenes.length > 0) {
      // Merge edited scenes with original to preserve dialogue, motion, transitions
      const mergedScenes = editedScenes.map((edited: Scene, index: number) => {
        const merged = {
          // Start with original scene data (has dialogue, motion, transitions from LLM)
          ...(originalScenes[index] || {}),
          // Override with edited values (user's changes to prompt, etc.)
          ...edited,
        };
        return migrateSceneMedia(merged);
      });
      setScenes(mergedScenes);
    } else if (originalScenes.length > 0) {
      setScenes(originalScenes.map(migrateSceneMedia));
    }
    if (normalized.generatedCharacters?.length > 0) setCharacters(normalized.generatedCharacters);
    if (normalized.selectedCharacter) setSelectedCharacter(normalized.selectedCharacter);
    if (normalized.generatedProductImages?.length > 0) setProductImages(normalized.generatedProductImages);
    if (normalized.selectedProductImage) setSelectedProductImage(normalized.selectedProductImage);
    if (normalized.targetDemographic) {
      setDemographics({
        ...normalized.targetDemographic,
        countries: normalized.targetDemographic.countries || []
      });
    }
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
    
    // Load stitched videos array
    const videos = sessionData.stitchedVideos || sessionData.stitched_videos;
    if (videos && Array.isArray(videos) && videos.length > 0) {
      setStitchedVideos(videos.map((v: any) => ({
        url: v.url,
        isNew: false,
        createdAt: new Date(v.createdAt || v.created_at || Date.now()),
        sceneCount: v.sceneCount || v.scene_count || 0
      })));
      setSelectedStitchedVideoIndex(0);
    } else if (normalized.videoUrl) {
      // Migrate legacy single videoUrl to stitchedVideos array
      setStitchedVideos([{
        url: normalized.videoUrl,
        isNew: false,
        createdAt: new Date(),
        sceneCount: 0
      }]);
      setSelectedStitchedVideoIndex(0);
    }
    
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
        tone: 'Casual',
        countries: []
      });
      setCountrySearch('');
      setShowCountryDropdown(false);
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
    
    // Check if we have any scenes with videos (using selected video)
    const scenesWithVideos = scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false);
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
      // Prepare scenes data with selected video URLs and transitions
      const scenesData = scenes
        .filter(s => s.included !== false)
        .map((scene) => ({
          videoUrl: getSelectedVideoUrl(scene),
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

      // Mark existing images as not new
      const existingImages = (scene.images || []).map(img => ({ ...img, isNew: false }));
      
      // Add new image to the beginning of the array
      const newImage: SceneImage = {
        url: response.data.imageUrl,
        isNew: true,
        createdAt: new Date()
      };
      
      const updatedImages = [newImage, ...existingImages];
      const newSelectedIndex = 0; // Select the new image (now at the beginning)

      // Update scene with new image added to array
      const updatedScenes = [...scenes];
      updatedScenes[index] = { 
        ...updatedScenes[index], 
        images: updatedImages,
        selectedImageIndex: newSelectedIndex,
        imageUrl: response.data.imageUrl, // Keep for backward compatibility
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

  const handleSelectSceneImage = (sceneIndex: number, imageIndex: number) => {
    const updatedScenes = [...scenes];
    updatedScenes[sceneIndex] = {
      ...updatedScenes[sceneIndex],
      selectedImageIndex: imageIndex,
      imageUrl: updatedScenes[sceneIndex].images?.[imageIndex]?.url // Update legacy field
    };
    setScenes(updatedScenes);
    handleUpdateScenes(updatedScenes);
  };

  const handleSelectSceneVideo = (sceneIndex: number, videoIndex: number) => {
    const updatedScenes = [...scenes];
    updatedScenes[sceneIndex] = {
      ...updatedScenes[sceneIndex],
      selectedVideoIndex: videoIndex,
      videoUrl: updatedScenes[sceneIndex].videos?.[videoIndex]?.url // Update legacy field
    };
    setScenes(updatedScenes);
    handleUpdateScenes(updatedScenes);
  };

  const handleGenerateSceneVideo = async (index: number) => {
    if (!session) return;
    
    const scene = scenes[index];
    const selectedImageUrl = getSelectedImageUrl(scene);
    
    if (!selectedImageUrl) {
      toast.error('Please generate a scene image first');
      return;
    }

    // Set generating state for video
    const newScenes = [...scenes];
    newScenes[index] = { 
      ...newScenes[index], 
      generatingVideo: true,
      videoStatus: 'queued',
      videoProgress: 0,
      videoError: undefined
    };
    setScenes(newScenes);

    try {
      // Build a comprehensive prompt from scene data
      const videoPrompt = `${scene.prompt}. Motion: ${scene.motion || 'smooth movement'}. The character says: "${scene.dialogue || ''}"`;
      
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-scene-video`,
        { 
          sceneIndex: index,
          prompt: videoPrompt,
          imageUrl: selectedImageUrl
        },
        { withCredentials: true }
      );

      // Job started - polling will pick up the status
      // Don't reset generatingVideo here - let polling handle it
    } catch (error) {
      console.error('Error generating scene video:', error);
      toast.error('Failed to start scene video generation');
      
      // Reset generating state
      const updatedScenes = [...scenes];
      updatedScenes[index] = { 
        ...updatedScenes[index], 
        generatingVideo: false,
        videoStatus: 'failed',
        videoError: 'Failed to start generation'
      };
      setScenes(updatedScenes);
    }
  };

  // Poll for scene video generation status
  const pollSceneVideoStatus = async () => {
    if (!session) return;
    
    try {
      const response = await axios.get(
        `/api/ugc/sessions/${session.id}/scene-video-status`,
        { withCredentials: true }
      );
      
      const jobs: SceneVideoJob[] = response.data.jobs || [];
      
      if (jobs.length === 0) return;
      
      // Update scenes with job status
      setScenes(currentScenes => {
        const updatedScenes = [...currentScenes];
        let hasChanges = false;
        
        for (const job of jobs) {
          const sceneIndex = job.sceneIndex;
          if (sceneIndex >= 0 && sceneIndex < updatedScenes.length) {
            const scene = updatedScenes[sceneIndex];
            const wasGenerating = scene.generatingVideo || scene.videoStatus === 'generating' || scene.videoStatus === 'queued';
            const isJobActive = job.status === 'queued' || job.status === 'generating';
            
            // Check if this video URL is already in the videos array
            const existingVideos = scene.videos || [];
            const videoAlreadyAdded = job.videoUrl && existingVideos.some(v => v.url === job.videoUrl);
            
            // Add new video to array when job completes (regardless of wasGenerating - handles page refresh)
            let newVideos = existingVideos;
            let newSelectedIndex = scene.selectedVideoIndex ?? 0;
            
            if (job.status === 'completed' && job.videoUrl && !videoAlreadyAdded) {
              // Mark existing videos as not new
              const updatedExisting = existingVideos.map(v => ({ ...v, isNew: false }));
              // Add new video to the beginning of the array
              const newVideo: SceneVideo = {
                url: job.videoUrl,
                isNew: wasGenerating, // Only mark as "new" if we were actively generating
                createdAt: new Date()
              };
              newVideos = [newVideo, ...updatedExisting];
              newSelectedIndex = 0; // Select the new video (now at the beginning)
            }
            
            // Update scene with job status
            // Only set generatingVideo if job is still active
            updatedScenes[sceneIndex] = {
              ...scene,
              videoStatus: job.status,
              videoProgress: job.progress,
              generatingVideo: isJobActive,
              videos: newVideos,
              selectedVideoIndex: newSelectedIndex,
              videoUrl: job.videoUrl || scene.videoUrl, // Keep legacy field updated
              videoError: job.errorMessage
            };
            
            // Show toast on completion (only if we were actively watching generation)
            if (wasGenerating && job.status === 'completed' && job.videoUrl && !videoAlreadyAdded) {
              toast.success(`Scene ${sceneIndex + 1} video generated!`);
              hasChanges = true;
            } else if (wasGenerating && job.status === 'failed') {
              toast.error(`Scene ${sceneIndex + 1} video failed: ${job.errorMessage || 'Unknown error'}`);
              hasChanges = true;
            }
          }
        }
        
        return updatedScenes;
      });
    } catch (error) {
      console.error('Error polling scene video status:', error);
    }
  };

  // Generate all scene videos at once
  const handleGenerateAllSceneVideos = async () => {
    if (!session) return;
    
    // Get scenes that have images and are included (can regenerate even if has videos)
    const scenesToGenerate = scenes.filter(s => getSelectedImageUrl(s) && s.included !== false);
    
    if (scenesToGenerate.length === 0) {
      toast.error('No scenes ready for video generation. Generate scene images first.');
      return;
    }

    // Set all to generating
    const newScenes = scenes.map(scene => {
      if (scene.imageUrl && !scene.videoUrl && scene.included !== false) {
        return {
          ...scene,
          generatingVideo: true,
          videoStatus: 'queued' as const,
          videoProgress: 0,
          videoError: undefined
        };
      }
      return scene;
    });
    setScenes(newScenes);

    try {
      const response = await axios.post(
        `/api/ugc/sessions/${session.id}/generate-all-scene-videos`,
        { scenes: scenesToGenerate },
        { withCredentials: true }
      );

      toast.success(`Started video generation for ${response.data.jobs?.length || scenesToGenerate.length} scenes`);
    } catch (error) {
      console.error('Error starting batch video generation:', error);
      toast.error('Failed to start batch video generation');
      
      // Reset generating states
      setScenes(scenes.map(scene => ({
        ...scene,
        generatingVideo: false,
        videoStatus: undefined,
        videoProgress: undefined
      })));
    }
  };

  const handleCreatePost = async () => {
    if (!videoUrl || !product || !session) return;
    
    setCreatingPost(true);
    try {
      const postContent = `🎬 Creative video for ${product.title}! 🎬\n\n${product.description}\n\n💰 Only $${product.price}!\n\n✨ Generated with AI creative studio\n\n#video #creative #${product.title.toLowerCase().replace(/\s+/g, '')}`;
      
      await axios.post('/api/ai/generate', {
        productId: product.id,
        type: 'video',
        customContent: postContent,
        customMediaUrl: videoUrl
      }, { withCredentials: true });
      
      toast.success('Post created successfully!');
      
      // Navigate to generated posts page with this product's accordion expanded
      navigate(`/posts?productId=${product.id}`);
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setCreatingPost(false);
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
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Completed</span>;
      case 'generating':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">In Progress</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">Draft</span>;
    }
  };

  const handleEditTitle = (sessionId: string, currentTitle: string) => {
    setEditingTitleId(sessionId);
    setEditTitleValue(currentTitle || 'New Session');
  };

  const handleSaveTitle = async (sessionId: string) => {
    try {
      await axios.patch(
        `/api/ugc/sessions/${sessionId}/title`,
        { title: editTitleValue },
        { withCredentials: true }
      );

      // Update local state
      setAllSessions(allSessions.map(s => 
        s.id === sessionId ? { ...s, title: editTitleValue } : s
      ));

      if (session?.id === sessionId) {
        setSession({ ...session, title: editTitleValue });
      }

      setEditingTitleId(null);
      toast.success('Title updated successfully');
    } catch (error) {
      console.error('Error updating title:', error);
      toast.error('Failed to update title');
    }
  };

  const handleCancelEdit = () => {
    setEditingTitleId(null);
    setEditTitleValue('');
  };

  const getSessionDisplayTitle = (session: UgcSession) => {
    if (session.title && session.title !== 'New Session') {
      return session.title;
    }
    if (session.targetDemographic) {
      return `${session.targetDemographic.ageGroup} • ${session.targetDemographic.gender} • ${session.targetDemographic.tone}`;
    }
    return 'New Session';
  };

  const getFilteredAndSortedSessions = () => {
    let filtered = allSessions.filter(s => {
      // Filter by search query
      const matchesSearch = searchQuery === '' || 
        getSessionDisplayTitle(s).toLowerCase().includes(searchQuery.toLowerCase());

      // Filter by status
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'title') {
        comparison = getSessionDisplayTitle(a).localeCompare(getSessionDisplayTitle(b));
      } else if (sortBy === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortBy === 'time') {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        comparison = dateA - dateB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const handleDeleteClick = (session: UgcSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);
    try {
      await axios.delete(`/api/ugc/sessions/${sessionToDelete.id}`, {
        withCredentials: true
      });

      // Update local state
      setAllSessions(allSessions.filter(s => s.id !== sessionToDelete.id));

      // If the deleted session is the current one, redirect to session picker
      if (session?.id === sessionToDelete.id) {
        setSession(null);
        setShowSessionPicker(true);
      }

      toast.success('Session deleted successfully');
      setShowDeleteConfirm(false);
      setSessionToDelete(null);
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setSessionToDelete(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <Loader className="h-12 w-12 text-purple-600 animate-spin" />
        </div>
      </div>
    );
  }

  // Session Picker Modal
  if (showSessionPicker) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate('/products')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Creative Studio</h1>
              <p className="text-gray-600">{product?.title}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Creative Sessions</h2>
              <button
                onClick={createNewSession}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all"
              >
                <Plus className="h-4 w-4" />
                New Session
              </button>
            </div>

            {allSessions.length === 0 ? (
              <div className="text-center py-12">
                <Wand2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-6">No creative sessions yet for this product</p>
                <button
                  onClick={createNewSession}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 mx-auto"
                >
                  <Plus className="h-5 w-5" />
                  Start Your First Session
                </button>
              </div>
            ) : (
              <>
                {/* Search and Filter Controls */}
                <div className="mb-6 space-y-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search sessions by title..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Filter and Sort Controls */}
                  <div className="flex flex-wrap gap-3">
                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-600" />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        <option value="all">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="generating">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>

                    {/* Sort By */}
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4 text-gray-600" />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'title' | 'status' | 'time')}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        <option value="time">Sort by Time</option>
                        <option value="title">Sort by Title</option>
                        <option value="status">Sort by Status</option>
                      </select>
                    </div>

                    {/* Sort Order */}
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    >
                      {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
                    </button>
                  </div>
                </div>

                {/* Sessions List */}
                <div className="space-y-3">
                  {getFilteredAndSortedSessions().length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-600">No sessions match your filters</p>
                    </div>
                  ) : (
                    getFilteredAndSortedSessions().map((s) => (
                      <div
                        key={s.id}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            {s.status === 'completed' ? (
                              <Check className="h-6 w-6 text-green-600" />
                            ) : (
                              <Wand2 className="h-6 w-6 text-purple-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingTitleId === s.id ? (
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="text"
                                  value={editTitleValue}
                                  onChange={(e) => setEditTitleValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitle(s.id);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  className="flex-1 px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveTitle(s.id);
                                  }}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelEdit();
                                  }}
                                  className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => loadSessionData(s)}
                                  className="text-gray-900 font-medium hover:text-purple-600 transition-colors text-left truncate"
                                >
                                  {getSessionDisplayTitle(s)}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditTitle(s.id, getSessionDisplayTitle(s));
                                  }}
                                  className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors flex-shrink-0"
                                  title="Edit title"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                {getStatusBadge(s.status)}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(s.updatedAt || s.createdAt)}
                              <span className="text-gray-400">•</span>
                              <span>Step {s.currentStep + 1} of {STEPS.length}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => handleDeleteClick(s, e)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete session"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => loadSessionData(s)}
                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Open session"
                          >
                            <ArrowRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal - for session picker view */}
        {showDeleteConfirm && sessionToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-semibold text-gray-900">Delete Session?</h3>
              </div>
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete <span className="text-gray-900 font-medium">"{getSessionDisplayTitle(sessionToDelete)}"</span>?
              </p>
              <p className="text-sm text-gray-600 mb-6">
                This action cannot be undone. All generated content including videos will be permanently deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Back Confirmation Modal */}
      {showBackConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 text-yellow-600 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-gray-900">Reset Progress?</h3>
            </div>
            <p className="text-gray-700 mb-6">
              Making changes to <span className="text-gray-900 font-medium">{STEPS[pendingStep || 0]?.name}</span> will 
              reset all subsequent steps. You'll need to regenerate from this point onwards.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBackConfirm(false);
                  setPendingStep(null);
                  setPendingEditCallback(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmGoBack}
                className="flex-1 px-4 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 transition-all"
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && sessionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-gray-900">Delete Session?</h3>
            </div>
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete <span className="text-gray-900 font-medium">"{getSessionDisplayTitle(sessionToDelete)}"</span>?
            </p>
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone. All generated content including videos will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </>
                )}
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
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Creative Studio</h1>
              <p className="text-gray-600">{product?.title}</p>
            </div>
          </div>
          <button
            onClick={() => setShowSessionPicker(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm shadow-sm"
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
                          ? 'bg-purple-600 text-white ring-4 ring-purple-200'
                          : isCompleted
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className={`mt-2 text-sm ${
                      isCurrent ? 'text-gray-900 font-medium' : 
                      isCompleted ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </span>
                    {isClickable && (
                      <span className="text-xs text-gray-500 mt-0.5">Click to view</span>
                    )}
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={`w-full h-1 mx-2 rounded ${
                      furthestStep > step.id ? 'bg-green-500' : 'bg-gray-200'
                    }`} style={{ width: '60px' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-md p-8 min-h-[500px]">
          {/* Step 0: Target Audience */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Define Your Target Audience</h2>
                <p className="text-gray-600">Help us create content that resonates with your ideal customer.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Age Group */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age Group</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.ageGroups?.map((age: string) => (
                      <button
                        key={age}
                        onClick={() => setDemographics({ ...demographics, ageGroup: age })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.ageGroup === age
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {age}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.genders?.map((gender: string) => (
                      <button
                        key={gender}
                        onClick={() => setDemographics({ ...demographics, gender })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.gender === gender
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interests */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Interests (select multiple)</label>
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
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Content Tone</label>
                  <div className="flex flex-wrap gap-2">
                    {demographicOptions?.tones?.map((tone: string) => (
                      <button
                        key={tone}
                        onClick={() => setDemographics({ ...demographics, tone })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          demographics.tone === tone
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Countries */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Countries</label>
                  
                  {/* Selected Countries Tags */}
                  {demographics.countries.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {demographics.countries.map((country) => (
                        <span
                          key={country}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium"
                        >
                          {country}
                          <button
                            onClick={() => {
                              setDemographics({
                                ...demographics,
                                countries: demographics.countries.filter(c => c !== country)
                              });
                            }}
                            className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Typeahead Input */}
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={(e) => {
                          setCountrySearch(e.target.value);
                          setShowCountryDropdown(true);
                        }}
                        onFocus={() => setShowCountryDropdown(true)}
                        placeholder="Search and select countries..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                      />
                    </div>
                    
                    {/* Dropdown */}
                    {showCountryDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredCountries.length > 0 ? (
                          filteredCountries.slice(0, 10).map((country) => (
                            <button
                              key={country}
                              onClick={() => {
                                setDemographics({
                                  ...demographics,
                                  countries: [...demographics.countries, country]
                                });
                                setCountrySearch('');
                                setShowCountryDropdown(false);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm hover:bg-purple-50 hover:text-purple-700 transition-colors border-b border-gray-100 last:border-b-0"
                            >
                              {country}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-500">
                            {countrySearch ? 'No countries found' : 'Type to search countries'}
                          </div>
                        )}
                        {filteredCountries.length > 10 && (
                          <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t">
                            Showing 10 of {filteredCountries.length} results. Type more to narrow down.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Click outside to close */}
                  {showCountryDropdown && (
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowCountryDropdown(false)}
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleStep0Submit}
                  disabled={generating || demographics.interests.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
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
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Choose Your Character</h2>
                <p className="text-gray-600">Select a character that best represents your brand ambassador.</p>
              </div>

              {/* Generated Prompts Display */}
              {(productPrompt || characterPrompt || productBreakdown || videoAdOutput) && (
                <div className="space-y-4">
                  {/* Product Breakdown (String) */}
                  {productBreakdown && (
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-200">
                      <h4 className="text-sm font-semibold text-purple-700 mb-4 flex items-center gap-2">
                        📊 Product Analysis (AI Generated)
                      </h4>
                      <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {productBreakdown}
                      </div>
                    </div>
                  )}

                  {/* Customer Avatar from Video Ad Output */}
                  {videoAdOutput?.customer_avatar && (
                    <div className="bg-gradient-to-r from-pink-50 to-orange-50 rounded-xl p-5 border border-pink-200">
                      <h4 className="text-sm font-semibold text-pink-700 mb-4 flex items-center gap-2">
                        👤 Customer Avatar
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h5 className="text-pink-700 font-medium mb-1">{videoAdOutput.customer_avatar.name}</h5>
                          <p className="text-gray-600 text-xs mb-2">{videoAdOutput.customer_avatar.demographics}</p>
                          <p className="text-gray-700">{videoAdOutput.customer_avatar.backstory}</p>
                        </div>
                        <div>
                          <h5 className="text-orange-700 font-medium mb-1">Visual Description</h5>
                          <p className="text-gray-700 text-xs">{videoAdOutput.customer_avatar.visual_description}</p>
                        </div>
                      </div>
                      {videoAdOutput.video_ad_script?.overall_tone && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <span className="text-xs text-gray-600">Ad Tone: </span>
                          <span className="text-xs text-purple-700 font-medium">{videoAdOutput.video_ad_script.overall_tone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product & Character Prompts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {productPrompt && (
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <h4 className="text-sm font-medium text-purple-700 mb-2 flex items-center gap-2">
                          <Wand2 className="h-4 w-4" />
                          Marketing Prompt
                        </h4>
                        <p className="text-gray-700 text-sm leading-relaxed">{productPrompt}</p>
                      </div>
                    )}
                    {characterPrompt && (
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <h4 className="text-sm font-medium text-pink-700 mb-2 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Character Prompt
                        </h4>
                        <p className="text-gray-700 text-sm leading-relaxed">{characterPrompt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {characters.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-6">Generate AI characters based on your target audience</p>
                  <button
                    onClick={handleGenerateCharacters}
                    disabled={generating}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 mx-auto shadow-md"
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
                        className={`relative rounded-xl overflow-hidden aspect-square group shadow-md hover:shadow-lg transition-all ${
                          selectedCharacter === char.url ? 'ring-4 ring-purple-600' : ''
                        }`}
                      >
                        <img src={char.url} alt="Character" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-medium">Select</span>
                        </div>
                        {selectedCharacter === char.url && (
                          <div className="absolute top-2 right-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center shadow-md">
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
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                    <button
                      onClick={handleContinueFromCharacter}
                      disabled={!selectedCharacter}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
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
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Product Reference Image</h2>
                <p className="text-gray-600">Select an image showing the character with your product.</p>
              </div>

              {productImages.length === 0 ? (
                <div className="text-center py-12">
                  <Image className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-6">Generate product reference images</p>
                  <button
                    onClick={handleGenerateProductImages}
                    disabled={generating}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 mx-auto shadow-md"
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
                        className={`relative rounded-xl overflow-hidden aspect-square group shadow-md hover:shadow-lg transition-all ${
                          selectedProductImage === img.url ? 'ring-4 ring-purple-600' : ''
                        }`}
                      >
                        <img src={img.url} alt="Product" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-medium">Select</span>
                        </div>
                        {selectedProductImage === img.url && (
                          <div className="absolute top-2 right-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center shadow-md">
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
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                    <button
                      onClick={handleContinueFromProductImage}
                      disabled={!selectedProductImage}
                      className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
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
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Edit Your Scenes</h2>
                <p className="text-gray-600">Customize and reorder the scenes for your video.</p>
              </div>

              <div className="space-y-6">
                {scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="bg-gray-50 rounded-xl p-5 border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => moveScene(index, 'up')}
                          disabled={index === 0}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveScene(index, 'down')}
                          disabled={index === scenes.length - 1}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-30"
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
                                scene.included !== false ? 'bg-purple-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                  scene.included !== false ? 'left-7' : 'left-1'
                                }`}
                              />
                            </button>
                            <h3 className="font-semibold text-gray-900 text-lg">
                              Scene {index + 1}: {scene.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {scene.included === false && (
                              <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded">Excluded</span>
                            )}
                            <span className="text-sm text-gray-600 bg-white border border-gray-300 px-3 py-1 rounded-full">{scene.duration}s</span>
                          </div>
                        </div>
                        
                        {/* Visuals */}
                        <div>
                          <label className="block text-sm font-medium text-purple-700 mb-1.5">
                            Visuals
                          </label>
                          <textarea
                            value={scene.prompt}
                            onChange={(e) => { updateScenePrompt(index, e.target.value); autoResize(e); }}
                            onBlur={() => handleUpdateScenes()}
                            onFocus={(e) => autoResize(e as any)}
                            className="scene-textarea w-full bg-white text-gray-900 rounded-lg p-3 text-sm border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none resize-none overflow-hidden"
                            style={{ minHeight: '60px' }}
                          />
                        </div>

                        {/* Dialogue */}
                        <div>
                          <label className="block text-sm font-medium text-pink-700 mb-1.5">
                            Dialogue
                          </label>
                          <textarea
                            value={scene.dialogue || ''}
                            onChange={(e) => { updateSceneDialogue(index, e.target.value); autoResize(e); }}
                            onBlur={() => handleUpdateScenes()}
                            onFocus={(e) => autoResize(e as any)}
                            className="scene-textarea w-full bg-white text-gray-900 rounded-lg p-3 text-sm border border-gray-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-200 outline-none resize-none overflow-hidden"
                            style={{ minHeight: '60px' }}
                            placeholder="Enter dialogue for this scene..."
                          />
                        </div>

                        {/* Motion & Transitions */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-blue-700 mb-1.5">
                              Motion
                            </label>
                            <input
                              type="text"
                              value={scene.motion || ''}
                              onChange={(e) => updateSceneMotion(index, e.target.value)}
                              onBlur={() => handleUpdateScenes()}
                              className="w-full bg-white text-gray-900 rounded-lg p-3 text-sm border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                              placeholder="Camera movement..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-orange-700 mb-1.5">
                              Transition Notes
                            </label>
                            <input
                              type="text"
                              value={scene.transitions || ''}
                              onChange={(e) => updateSceneTransitions(index, e.target.value)}
                              onBlur={() => handleUpdateScenes()}
                              className="w-full bg-white text-gray-900 rounded-lg p-3 text-sm border border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none"
                              placeholder="Transition type..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-green-700 mb-1.5">
                              Video Transition {index < scenes.length - 1 ? '→ Next' : '(End)'}
                            </label>
                            <select
                              value={scene.transitionType || 'fade'}
                              onChange={(e) => updateSceneTransitionType(index, e.target.value as Scene['transitionType'])}
                              disabled={index === scenes.length - 1}
                              className="w-full bg-white text-gray-900 rounded-lg p-3 text-sm border border-gray-300 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none disabled:opacity-50"
                            >
                              {TRANSITION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Scene Image & Video Section */}
                        <div className="pt-4 border-t border-gray-600">
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                            
                            {/* LEFT: Image Section */}
                            <div className="space-y-3 flex flex-col items-center">
                              <div className="relative group cursor-help">
                                <div className="flex items-center justify-center gap-2 text-sm font-medium text-purple-400">
                                  <Wand2 className="h-4 w-4" />
                                  Scene Image
                                  <span className="text-gray-500 text-xs">ⓘ</span>
                                </div>
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-gray-700 shadow-lg z-10">
                                  Based on your product shot from previous step
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                              
                              {/* Image Gallery - Multiple images with selection */}
                              {scene.images && scene.images.length > 0 ? (
                                <div className="space-y-2 w-full">
                                  {/* Selected Image Preview */}
                                  <div className="min-h-32 max-h-48 bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
                                    <img 
                                      src={getSelectedImageUrl(scene)} 
                                      alt={`Scene ${index + 1} - Selected`} 
                                      className="max-h-48 max-w-full h-auto w-auto object-contain"
                                    />
                                  </div>
                                  
                                  {/* Image Thumbnails */}
                                  {scene.images.length > 1 && (
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                      {scene.images.map((img, imgIndex) => (
                                        <button
                                          key={imgIndex}
                                          onClick={() => handleSelectSceneImage(index, imgIndex)}
                                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                                            (scene.selectedImageIndex ?? 0) === imgIndex
                                              ? 'border-purple-500 ring-2 ring-purple-500/50'
                                              : 'border-gray-600 hover:border-gray-500'
                                          }`}
                                        >
                                          <img 
                                            src={img.url} 
                                            alt={`Variant ${imgIndex + 1}`}
                                            className="w-full h-full object-cover"
                                          />
                                          {/* Selected checkmark */}
                                          {(scene.selectedImageIndex ?? 0) === imgIndex && (
                                            <div className="absolute bottom-0 right-0 bg-purple-500 p-0.5 rounded-tl">
                                              <Check className="h-3 w-3 text-white" />
                                            </div>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {/* Selection hint */}
                                  {scene.images.length > 1 && (
                                    <p className="text-xs text-gray-500 text-center">
                                      {scene.images.length} variations • Click to select
                                    </p>
                                  )}
                                  
                                  {/* Generate Another Button */}
                                  <div className="w-full relative group">
                                    <button
                                      onClick={() => handleGenerateSceneImage(index)}
                                      disabled={scene.generating || !scene.prompt || scene.generatingVideo}
                                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                      {scene.generating ? (
                                        <>
                                          <Loader className="h-4 w-4 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        <>
                                          <Wand2 className="h-4 w-4" />
                                          Generate Another
                                        </>
                                      )}
                                    </button>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-gray-700 shadow-lg z-10">
                                      {scene.generatingVideo 
                                        ? 'Disabled while video is generating'
                                        : 'Edit prompt above for different variations'}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="min-h-48 bg-gray-800 rounded-lg overflow-hidden border border-gray-600 flex flex-col items-center justify-center p-6">
                                  <Wand2 className="h-10 w-10 text-gray-500 mb-4 opacity-50" />
                                  {/* Generate Image Button - inside the empty state */}
                                  <button
                                    onClick={() => handleGenerateSceneImage(index)}
                                    disabled={scene.generating || !scene.prompt || scene.generatingVideo}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                  >
                                    {scene.generating ? (
                                      <>
                                        <Loader className="h-4 w-4 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Wand2 className="h-4 w-4" />
                                        Generate Image
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                              {scene.generatingVideo && (
                                <p className="text-xs text-gray-500 text-center">
                                  Disabled while video is generating
                                </p>
                              )}
                            </div>

                            {/* CENTER: Arrow Divider */}
                            <div className="flex flex-col items-center justify-center h-full py-8">
                              <div className="w-px h-full bg-gradient-to-b from-transparent via-gray-600 to-transparent" />
                              <div className="my-2 flex items-center justify-center w-10 h-10 rounded-full bg-gray-700 border border-gray-600">
                                <ArrowRight className="h-5 w-5 text-gray-400" />
                              </div>
                              <div className="w-px h-full bg-gradient-to-b from-transparent via-gray-600 to-transparent" />
                            </div>

                            {/* RIGHT: Video Section */}
                            <div className="space-y-3 flex flex-col items-center">
                              <div className="relative group cursor-help">
                                <div className="flex items-center justify-center gap-2 text-sm font-medium text-cyan-400">
                                  <Film className="h-4 w-4" />
                                  Scene Video
                                  <span className="text-gray-500 text-xs">ⓘ</span>
                                </div>
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-gray-700 shadow-lg z-10">
                                  Animated from the selected image
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                </div>
                              </div>
                              
                              {/* Video Gallery - Multiple videos with selection */}
                              {scene.videos && scene.videos.length > 0 ? (
                                <div className="space-y-2 w-full">
                                  {/* Selected Video Preview */}
                                  <div className="min-h-32 max-h-48 bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
                                    <video 
                                      src={getSelectedVideoUrl(scene)} 
                                      controls 
                                      className="max-h-48 max-w-full h-auto w-auto object-contain"
                                    />
                                  </div>
                                  
                                  {/* Video Thumbnails */}
                                  {scene.videos.length > 1 && (
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                      {scene.videos.map((vid, vidIndex) => (
                                        <button
                                          key={vidIndex}
                                          onClick={() => handleSelectSceneVideo(index, vidIndex)}
                                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                                            (scene.selectedVideoIndex ?? 0) === vidIndex
                                              ? 'border-cyan-500 ring-2 ring-cyan-500/50'
                                              : 'border-gray-600 hover:border-gray-500'
                                          }`}
                                        >
                                          <video 
                                            src={vid.url} 
                                            className="w-full h-full object-cover"
                                            muted
                                          />
                                          {/* Play icon overlay */}
                                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                            <Film className="h-4 w-4 text-white/80" />
                                          </div>
                                          {/* Selected checkmark */}
                                          {(scene.selectedVideoIndex ?? 0) === vidIndex && (
                                            <div className="absolute bottom-0 right-0 bg-cyan-500 p-0.5 rounded-tl">
                                              <Check className="h-3 w-3 text-white" />
                                            </div>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {/* Selection hint */}
                                  {!scene.generatingVideo && scene.videos.length > 1 && (
                                    <p className="text-xs text-gray-500 text-center">
                                      {scene.videos.length} variations • Click to select
                                    </p>
                                  )}
                                  
                                  {/* Generation Progress - shown below existing videos */}
                                  {scene.generatingVideo ? (
                                    <div className="bg-gray-800/80 rounded-lg border border-cyan-500/50 p-3">
                                      <div className="flex items-center gap-3">
                                        <Loader className="h-5 w-5 text-cyan-400 animate-spin flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-gray-300 text-sm font-medium">
                                            {scene.videoStatus === 'queued' ? 'Queued...' : `Generating new video ${scene.videoProgress || 0}%`}
                                          </p>
                                          <div className="mt-1.5">
                                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                              <div 
                                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                                                style={{ width: `${scene.videoProgress || 0}%` }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Generate Another Button */
                                    <div className="w-full relative group">
                                      <button
                                        onClick={() => handleGenerateSceneVideo(index)}
                                        disabled={!getSelectedImageUrl(scene) || scene.generatingVideo}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                      >
                                        <Film className="h-4 w-4" />
                                        Generate Another
                                      </button>
                                      {/* Tooltip */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-gray-700 shadow-lg z-10">
                                        Select a different image for new variations
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : scene.generatingVideo ? (
                                <div className="min-h-32 bg-gray-800 rounded-lg border border-gray-600 flex items-center justify-center">
                                  <div className="text-center p-6 min-w-40">
                                    <Loader className="h-8 w-8 mx-auto mb-3 text-cyan-400 animate-spin" />
                                    <p className="text-gray-300 text-sm font-medium">
                                      {scene.videoStatus === 'queued' ? 'Queued...' : `Generating ${scene.videoProgress || 0}%`}
                                    </p>
                                    {/* Progress bar */}
                                    <div className="mt-3">
                                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                                          style={{ width: `${scene.videoProgress || 0}%` }}
                                        />
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {scene.videoStatus === 'queued' && '⏳ Waiting in queue...'}
                                        {scene.videoStatus === 'generating' && '🎬 Processing...'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="min-h-48 bg-gray-800 rounded-lg border border-gray-600 flex flex-col items-center justify-center p-6">
                                  <Film className="h-10 w-10 text-gray-500 mb-4 opacity-50" />
                                  {/* Generate Video Button - inside the empty state */}
                                  <div className="relative group">
                                    <button
                                      onClick={() => handleGenerateSceneVideo(index)}
                                      disabled={!getSelectedImageUrl(scene) || scene.generatingVideo}
                                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                      <Film className="h-4 w-4" />
                                      Generate Video
                                    </button>
                                    {/* Custom tooltip for disabled state */}
                                    {!getSelectedImageUrl(scene) && (
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-gray-300 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-gray-700 shadow-lg">
                                        Generate a scene image first
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Error message */}
                              {scene.videoStatus === 'failed' && scene.videoError && (
                                <p className="text-xs text-red-400 text-center">
                                  ❌ {scene.videoError}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary & Action Buttons */}
              <div className="pt-4 border-t border-gray-700 space-y-4">
                {/* Status Summary */}
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-400">
                    <span className="text-green-400 font-medium">
                      {scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false).length}
                    </span>
                    {' / '}
                    <span>{scenes.filter(s => s.included !== false).length}</span>
                    {' scenes have videos'}
                    {scenes.some(s => s.generatingVideo) && (
                      <span className="ml-3 text-blue-400">
                        ({scenes.filter(s => s.generatingVideo).length} generating...)
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {scenes.filter(s => s.imageUrl && !s.videoUrl && s.included !== false).length} scenes ready for video generation
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                  {/* Generate All Videos Button */}
                  <button
                    onClick={handleGenerateAllSceneVideos}
                    disabled={
                      scenes.filter(s => s.imageUrl && !s.videoUrl && s.included !== false).length === 0 ||
                      scenes.some(s => s.generatingVideo)
                    }
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scenes.some(s => s.generatingVideo) ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" />
                        Generating {scenes.filter(s => s.generatingVideo).length} videos...
                      </>
                    ) : (
                      <>
                        <Film className="h-4 w-4" />
                        Generate All Videos ({scenes.filter(s => s.imageUrl && !s.videoUrl && s.included !== false).length})
                      </>
                    )}
                  </button>

                  {/* Stitch Videos Button */}
                  <button
                    onClick={handleGenerateVideo}
                    disabled={
                      scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false).length === 0 ||
                      scenes.some(s => s.generatingVideo)
                    }
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="h-5 w-5" />
                    Stitch Videos ({scenes.filter(s => getSelectedVideoUrl(s) && s.included !== false).length} scenes)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Video Generation */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {videoStatus === 'completed' || stitchedVideos.length > 0 ? 'Your Videos' : 'Generating Your Video'}
                </h2>
                <p className="text-gray-600">
                  {videoStatus === 'completed' || stitchedVideos.length > 0
                    ? 'Download and share your creative content.'
                    : 'Please wait while we create your video...'}
                </p>
              </div>

              {/* Generation Progress - shown while stitching, but doesn't hide previous videos */}
              {videoStatus === 'generating' && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
                  <div className="max-w-md mx-auto">
                    {/* Stage indicator */}
                    <div className="flex justify-center gap-2 mb-4">
                      {['downloading', 'processing', 'stitching', 'uploading'].map((stage, idx) => (
                        <div key={stage} className="flex items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shadow-sm ${
                            stitchingStage === stage 
                              ? 'bg-purple-600 text-white animate-pulse' 
                              : ['downloading', 'processing', 'stitching', 'uploading'].indexOf(stitchingStage) > idx
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                          }`}>
                            {['downloading', 'processing', 'stitching', 'uploading'].indexOf(stitchingStage) > idx ? '✓' : idx + 1}
                          </div>
                          {idx < 3 && <div className="w-6 h-0.5 bg-gray-300 mx-1" />}
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-700 font-medium text-sm">Generating new video...</span>
                      <span className="text-gray-900 font-semibold">{videoProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                    <p className="text-gray-600 text-xs mt-2 text-center">
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
                    {/* Reset button for stuck generation */}
                    <button
                      onClick={async () => {
                        try {
                          await axios.post(`/api/ugc/sessions/${session?.id}/reset-video-status`, {}, { withCredentials: true });
                          setVideoStatus('draft');
                          setVideoProgress(0);
                          setStitchingStage('');
                          setStitchingMessage('');
                          toast.success('Video generation reset. You can try again.');
                        } catch (error) {
                          toast.error('Failed to reset');
                        }
                      }}
                      className="mt-4 text-xs text-gray-500 hover:text-red-600 underline transition-colors"
                    >
                      Stuck? Click to reset and try again
                    </button>
                  </div>
                </div>
              )}

              {/* Video Gallery - show all stitched videos */}
              {stitchedVideos.length > 0 && (
                <div className="py-4">
                  <div className="max-w-3xl mx-auto">
                    {/* Selected Video Preview */}
                    <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4 shadow-lg">
                      <video
                        src={stitchedVideos[selectedStitchedVideoIndex]?.url}
                        controls
                        className="w-full h-full"
                        poster={product?.imageUrl}
                      />
                    </div>
                    
                    {/* Video Thumbnails */}
                    {stitchedVideos.length > 1 && (
                      <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
                        {stitchedVideos.map((vid, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedStitchedVideoIndex(idx)}
                            className={`relative flex-shrink-0 w-24 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                              selectedStitchedVideoIndex === idx
                                ? 'border-purple-500 ring-2 ring-purple-500/50'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            <video 
                              src={vid.url} 
                              className="w-full h-full object-cover"
                              muted
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play className="h-4 w-4 text-white/80" />
                            </div>
                            {selectedStitchedVideoIndex === idx && (
                              <div className="absolute bottom-0 right-0 bg-purple-500 p-0.5 rounded-tl">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {/* Video info */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-500">
                        {stitchedVideos.length} video{stitchedVideos.length > 1 ? 's' : ''} generated
                        {stitchedVideos[selectedStitchedVideoIndex] && (
                          <span className="ml-2">
                            • {stitchedVideos[selectedStitchedVideoIndex].sceneCount} scenes
                          </span>
                        )}
                      </p>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-center gap-4">
                        <a
                          href={stitchedVideos[selectedStitchedVideoIndex]?.url}
                          download
                          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all shadow-md"
                        >
                          <Download className="h-5 w-5" />
                          Download Video
                        </a>
                        <button
                          onClick={handleCreatePost}
                          disabled={creatingPost}
                          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingPost ? (
                            <>
                              <Loader className="h-5 w-5 animate-spin" />
                              Creating Post...
                            </>
                          ) : (
                            <>
                              <FileText className="h-5 w-5" />
                              Create Post
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setCurrentStep(3)}
                          disabled={videoStatus === 'generating'}
                          className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-all disabled:opacity-50"
                        >
                          <Wand2 className="h-5 w-5" />
                          Generate Another
                        </button>
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={() => setShowSessionPicker(true)}
                          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-all"
                        >
                          View All Sessions
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state - no videos yet and not generating */}
              {stitchedVideos.length === 0 && videoStatus !== 'generating' && (
                <div className="py-12 text-center">
                  <Film className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No videos generated yet</p>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 mx-auto"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    Back to Scenes
                  </button>
                </div>
              )}

              {videoStatus === 'failed' && stitchedVideos.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-red-600 mb-4 font-medium">Video generation failed. Please try again.</p>
                  <button
                    onClick={handleGenerateVideo}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 mx-auto shadow-md"
                  >
                    <RefreshCw className="h-5 w-5" />
                    Retry
                  </button>
                </div>
              )}
              
              {/* Failed but has previous videos - show error banner */}
              {videoStatus === 'failed' && stitchedVideos.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-red-600 text-sm font-medium">
                      ❌ Latest video generation failed. Your previous videos are still available.
                    </p>
                    <button
                      onClick={handleGenerateVideo}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </button>
                  </div>
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
