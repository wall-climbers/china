import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { uploadVideoToS3 } from './s3';

// Set ffmpeg path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface SceneVideo {
  videoUrl: string;
  transition?: 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose' | 'none';
  duration?: number; // estimated duration in seconds
  includeInFinal?: boolean;
}

export interface StitchOptions {
  scenes: SceneVideo[];
  transitionDuration?: number; // in seconds, default 0.5
  outputQuality?: 'high' | 'medium' | 'low';
}

export interface StitchResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  duration?: number;
}

export interface StitchProgress {
  stage: 'downloading' | 'processing' | 'stitching' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

type ProgressCallback = (progress: StitchProgress) => void;

/**
 * Video Stitching Service using FFmpeg
 * Combines multiple video clips with smart transitions
 */
export class VideoStitcherService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'video-stitcher');
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Download a video from URL to local temp file
   */
  private async downloadVideo(url: string, filename: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${url} (${response.status})`);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(this.tempDir, filename);
    await writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Get video duration using ffprobe
   */
  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.warn(`Could not get duration for ${filePath}, using default 4s`);
          resolve(4); // Default to 4 seconds
        } else {
          resolve(metadata.format.duration || 4);
        }
      });
    });
  }

  /**
   * Stitch multiple videos together with transitions
   */
  async stitchVideos(
    options: StitchOptions, 
    onProgress?: ProgressCallback
  ): Promise<StitchResult> {
    const { 
      scenes, 
      transitionDuration = 0.5,
      outputQuality = 'high'
    } = options;
    
    const jobId = uuidv4();
    const reportProgress = onProgress || (() => {});

    // Filter to only include scenes that should be in final video
    const includedScenes = scenes.filter(s => s.includeInFinal !== false);
    
    if (includedScenes.length === 0) {
      return { success: false, error: 'No scenes to stitch' };
    }

    if (includedScenes.length === 1) {
      // Single video, just return it
      return { success: true, videoUrl: includedScenes[0].videoUrl };
    }

    await this.ensureTempDir();
    const localPaths: string[] = [];
    const durations: number[] = [];

    try {
      console.log(`🎬 Starting video stitching job ${jobId} with ${includedScenes.length} scenes...`);
      reportProgress({ stage: 'downloading', progress: 0, message: 'Starting download...' });

      // Download all videos
      for (let i = 0; i < includedScenes.length; i++) {
        const scene = includedScenes[i];
        console.log(`   Downloading scene ${i + 1}/${includedScenes.length}...`);
        reportProgress({ 
          stage: 'downloading', 
          progress: Math.round((i / includedScenes.length) * 30),
          message: `Downloading scene ${i + 1}/${includedScenes.length}...`
        });

        const localPath = await this.downloadVideo(
          scene.videoUrl, 
          `${jobId}-scene-${i}.mp4`
        );
        localPaths.push(localPath);

        // Get actual duration or use provided
        const duration = scene.duration || await this.getVideoDuration(localPath);
        durations.push(duration);
      }

      reportProgress({ stage: 'processing', progress: 30, message: 'Preparing video segments...' });

      const outputPath = path.join(this.tempDir, `${jobId}-stitched.mp4`);

      // Determine stitching strategy based on number of scenes
      if (includedScenes.length === 2) {
        // For 2 scenes, use simple xfade
        await this.stitchTwoVideos(localPaths, includedScenes, outputPath, transitionDuration, durations);
      } else {
        // For 3+ scenes, use concat with crossfade filter
        await this.stitchMultipleVideos(localPaths, includedScenes, outputPath, transitionDuration, durations, (p) => {
          reportProgress({ 
            stage: 'stitching', 
            progress: 30 + Math.round(p * 0.5),
            message: 'Stitching videos...'
          });
        });
      }

      console.log(`✅ Video stitching complete, uploading to S3...`);
      reportProgress({ stage: 'uploading', progress: 80, message: 'Uploading final video...' });

      // Upload to S3
      const videoBuffer = await readFile(outputPath);
      const s3Url = await uploadVideoToS3(videoBuffer, `stitched-${jobId}.mp4`);

      // Get final duration
      const finalDuration = await this.getVideoDuration(outputPath);

      // Cleanup temp files
      await this.cleanup([...localPaths, outputPath]);

      console.log(`✅ Stitched video uploaded: ${s3Url}`);
      reportProgress({ stage: 'complete', progress: 100, message: 'Video ready!' });

      return { 
        success: true, 
        videoUrl: s3Url,
        duration: finalDuration
      };

    } catch (error) {
      console.error('❌ Video stitching failed:', error);
      await this.cleanup(localPaths);
      reportProgress({ 
        stage: 'error', 
        progress: 0, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Stitch exactly 2 videos with xfade transition
   */
  private async stitchTwoVideos(
    inputPaths: string[],
    scenes: SceneVideo[],
    outputPath: string,
    transitionDuration: number,
    durations: number[]
  ): Promise<void> {
    const transition = scenes[0].transition || 'fade';
    const offset = Math.max(0, durations[0] - transitionDuration);

    return new Promise((resolve, reject) => {
      console.log(`   Using xfade transition: ${transition} at offset ${offset}s`);
      
      const command = ffmpeg()
        .input(inputPaths[0])
        .input(inputPaths[1]);

      // Build filter based on transition type
      let filterComplex: string;
      if (transition === 'none') {
        // Simple concatenation without transition
        filterComplex = `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]`;
      } else {
        // Video with transition
        filterComplex = `[0:v][1:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}[outv];[0:a][1:a]acrossfade=d=${transitionDuration}[outa]`;
      }

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Stitch 3+ videos with chained transitions
   */
  private async stitchMultipleVideos(
    inputPaths: string[],
    scenes: SceneVideo[],
    outputPath: string,
    transitionDuration: number,
    durations: number[],
    onProgress: (progress: number) => void
  ): Promise<void> {
    // For multiple videos, we'll chain xfade filters
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      // Add all inputs
      inputPaths.forEach(path => command.input(path));

      // Build complex filter for chained transitions
      let filterComplex = '';
      let audioFilter = '';
      let currentVideoLabel = '[0:v]';
      let currentAudioLabel = '[0:a]';
      let cumulativeDuration = durations[0];

      for (let i = 1; i < inputPaths.length; i++) {
        const transition = scenes[i - 1].transition || 'fade';
        const offset = Math.max(0, cumulativeDuration - transitionDuration);
        const nextVideoLabel = i === inputPaths.length - 1 ? '[outv]' : `[v${i}]`;
        const nextAudioLabel = i === inputPaths.length - 1 ? '[outa]' : `[a${i}]`;

        if (transition === 'none') {
          // Simple concat for this segment
          filterComplex += `${currentVideoLabel}[${i}:v]concat=n=2:v=1:a=0${nextVideoLabel};`;
          audioFilter += `${currentAudioLabel}[${i}:a]concat=n=2:v=0:a=1${nextAudioLabel};`;
        } else {
          filterComplex += `${currentVideoLabel}[${i}:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}${nextVideoLabel};`;
          audioFilter += `${currentAudioLabel}[${i}:a]acrossfade=d=${transitionDuration}${nextAudioLabel};`;
        }

        currentVideoLabel = nextVideoLabel;
        currentAudioLabel = nextAudioLabel;
        cumulativeDuration += durations[i] - (transition !== 'none' ? transitionDuration : 0);
      }

      // Combine video and audio filters
      const fullFilter = filterComplex + audioFilter.slice(0, -1); // Remove trailing semicolon

      console.log(`   Using chained xfade transitions for ${inputPaths.length} videos`);

      command
        .complexFilter(fullFilter)
        .outputOptions([
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          if (progress.percent) {
            onProgress(progress.percent / 100);
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          // Fallback to simple concatenation if complex filter fails
          this.fallbackConcatenation(inputPaths, outputPath)
            .then(resolve)
            .catch(reject);
        })
        .run();
    });
  }

  /**
   * Fallback: Simple concatenation without transitions
   */
  private async fallbackConcatenation(inputPaths: string[], outputPath: string): Promise<void> {
    console.log('   Falling back to simple concatenation...');
    
    // Create concat file
    const concatFile = path.join(this.tempDir, `concat-${Date.now()}.txt`);
    const concatContent = inputPaths.map(p => `file '${p}'`).join('\n');
    await writeFile(concatFile, concatContent);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k'
        ])
        .output(outputPath)
        .on('end', async () => {
          await unlink(concatFile).catch(() => {});
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Analyze scene content to suggest optimal transition
   * This is a "smart" feature that could be enhanced with AI later
   */
  suggestTransition(fromScene: SceneVideo, toScene: SceneVideo): SceneVideo['transition'] {
    // Default transitions based on common scenarios
    // In the future, this could analyze actual video content
    const transitions: SceneVideo['transition'][] = [
      'fade',
      'dissolve',
      'wipeleft',
      'slideup',
      'circleopen'
    ];
    
    // For now, return a varied selection based on scene index
    // Could be enhanced with actual content analysis
    return transitions[Math.floor(Math.random() * transitions.length)];
  }

  /**
   * Auto-assign transitions to scenes based on their content/section
   */
  autoAssignTransitions(scenes: SceneVideo[]): SceneVideo[] {
    const sectionTransitions: Record<string, SceneVideo['transition']> = {
      'hook': 'fade',
      'problem': 'dissolve',
      'solution': 'wipeleft',
      'testimonial': 'circleopen',
      'cta': 'fade'
    };

    return scenes.map((scene, index) => {
      if (scene.transition) return scene; // Keep existing transition
      
      // If no transition specified, use smart defaults
      if (index === scenes.length - 1) {
        // Last scene - no transition needed
        return { ...scene, transition: 'none' };
      }
      
      // Default to fade for smooth transitions
      return { ...scene, transition: 'fade' };
    });
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        if (existsSync(p)) {
          await unlink(p);
        }
      } catch (e) {
        console.warn(`Cleanup warning for ${p}:`, e);
      }
    }
  }
}

// Export singleton instance
export const videoStitcherService = new VideoStitcherService();

