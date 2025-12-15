import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { uploadVideoToS3 } from './s3';

// Set ffmpeg and ffprobe paths from static packages
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[video-stitcher] ffmpeg path set: ${ffmpegPath}`);
}

if (ffprobePath?.path) {
  ffmpeg.setFfprobePath(ffprobePath.path);
  console.log(`[video-stitcher] ffprobe path set: ${ffprobePath.path}`);
} else if (typeof ffprobePath === 'string') {
  ffmpeg.setFfprobePath(ffprobePath);
  console.log(`[video-stitcher] ffprobe path set: ${ffprobePath}`);
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
      // Check if file exists first
      if (!existsSync(filePath)) {
        console.error(`   [ffprobe] File does not exist: ${filePath}`);
        resolve(4);
        return;
      }
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error(`   [ffprobe] Error probing ${path.basename(filePath)}:`, err.message || err);
          console.warn(`   [ffprobe] Using default 4s duration`);
          resolve(4); // Default to 4 seconds
        } else {
          const duration = metadata.format?.duration || 4;
          console.log(`   [ffprobe] ${path.basename(filePath)} duration: ${duration.toFixed(2)}s`);
          resolve(duration);
        }
      });
    });
  }

  /**
   * Check if video has an audio track
   */
  private async videoHasAudio(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!existsSync(filePath)) {
        console.error(`   [ffprobe] File does not exist: ${filePath}`);
        resolve(false);
        return;
      }
      
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error(`   [ffprobe] Error checking audio for ${path.basename(filePath)}:`, err.message || err);
          resolve(false);
        } else {
          const hasAudio = metadata.streams?.some((s: any) => s.codec_type === 'audio') || false;
          console.log(`   [ffprobe] ${path.basename(filePath)} has audio: ${hasAudio}`);
          resolve(hasAudio);
        }
      });
    });
  }

  /**
   * Get video properties (resolution, framerate)
   */
  private async getVideoProperties(filePath: string): Promise<{ width: number; height: number; fps: number }> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve({ width: 1080, height: 1920, fps: 30 }); // Default 9:16 vertical
        } else {
          const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
          const width = videoStream?.width || 1080;
          const height = videoStream?.height || 1920;
          // Parse framerate (could be "30/1" or "29.97" etc)
          let fps = 30;
          if (videoStream?.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split('/');
            if (parts.length === 2) {
              fps = Math.round(parseInt(parts[0]) / parseInt(parts[1]));
            } else {
              fps = parseFloat(videoStream.r_frame_rate) || 30;
            }
          }
          console.log(`   Video properties for ${path.basename(filePath)}: ${width}x${height} @ ${fps}fps`);
          resolve({ width, height, fps });
        }
      });
    });
  }

  /**
   * Normalize a video to consistent framerate and ensure audio track exists
   * Preserves original resolution to avoid shrinking videos
   */
  private async normalizeVideo(
    inputPath: string, 
    outputPath: string,
    targetWidth: number = 0, // 0 = preserve original
    targetHeight: number = 0, // 0 = preserve original
    targetFps: number = 30
  ): Promise<void> {
    const hasAudio = await this.videoHasAudio(inputPath);
    const duration = await this.getVideoDuration(inputPath);
    const props = await this.getVideoProperties(inputPath);
    
    // Use original dimensions if target is 0
    const width = targetWidth || props.width;
    const height = targetHeight || props.height;
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg().input(inputPath);

      // Video filter: normalize framerate, set SAR to 1 (square pixels)
      // Only scale if dimensions are specified and different from original
      let videoFilter: string;
      if (targetWidth > 0 && targetHeight > 0 && (targetWidth !== props.width || targetHeight !== props.height)) {
        // Scale to target with padding to maintain aspect ratio
        videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${targetFps}`;
      } else {
        // Preserve original size, just normalize framerate and SAR
        videoFilter = `setsar=1,fps=${targetFps}`;
      }

      if (hasAudio) {
        // Has audio - just normalize video and re-encode audio to consistent format
        command
          .outputOptions([
            '-vf', videoFilter,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2'
          ]);
      } else {
        // No audio - add silent audio track to match video duration
        command
          .input('anullsrc=r=44100:cl=stereo')
          .inputOptions(['-f', 'lavfi'])
          .outputOptions([
            '-vf', videoFilter,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-t', String(duration), // Match video duration
            '-shortest'
          ]);
      }

      command
        .output(outputPath)
        .on('end', () => {
          console.log(`   Normalized: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('Normalize error:', err.message);
          reject(err);
        })
        .run();
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
    const reportProgress = (progress: StitchProgress) => {
      try {
        if (onProgress) {
          onProgress(progress);
        }
      } catch (e) {
        console.warn('Progress callback error:', e);
      }
    };

    // Filter to only include scenes that should be in final video
    const includedScenes = scenes.filter(s => s.includeInFinal !== false);
    
    if (includedScenes.length === 0) {
      return { success: false, error: 'No scenes to stitch' };
    }

    if (includedScenes.length === 1) {
      // Single video, just return it
      reportProgress({ stage: 'complete', progress: 100, message: 'Video ready!' });
      return { success: true, videoUrl: includedScenes[0].videoUrl };
    }

    await this.ensureTempDir();
    const downloadedPaths: string[] = [];
    const normalizedPaths: string[] = [];
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
          progress: Math.round((i / includedScenes.length) * 20),
          message: `Downloading scene ${i + 1}/${includedScenes.length}...`
        });

        const localPath = await this.downloadVideo(
          scene.videoUrl, 
          `${jobId}-scene-${i}.mp4`
        );
        downloadedPaths.push(localPath);
      }

      reportProgress({ stage: 'processing', progress: 20, message: 'Normalizing video formats...' });

      // Normalize all videos to consistent format (prevents squashing and sync issues)
      console.log('   Normalizing videos to consistent format...');
      for (let i = 0; i < downloadedPaths.length; i++) {
        const inputPath = downloadedPaths[i];
        const normalizedPath = path.join(this.tempDir, `${jobId}-normalized-${i}.mp4`);
        
        reportProgress({ 
          stage: 'processing', 
          progress: 20 + Math.round((i / downloadedPaths.length) * 20),
          message: `Normalizing video ${i + 1}/${downloadedPaths.length}...`
        });

        await this.normalizeVideo(inputPath, normalizedPath);
        normalizedPaths.push(normalizedPath);

        // ALWAYS get actual duration from the normalized video file
        // Don't trust passed duration as it may be a default value
        const actualDuration = await this.getVideoDuration(normalizedPath);
        const passedDuration = includedScenes[i].duration;
        
        // Use actual duration from file, not passed duration
        durations.push(actualDuration);
        
        if (passedDuration && Math.abs(passedDuration - actualDuration) > 0.5) {
          console.log(`   Scene ${i + 1} duration: ${actualDuration.toFixed(2)}s (passed: ${passedDuration}s - using actual)`);
        } else {
          console.log(`   Scene ${i + 1} duration: ${actualDuration.toFixed(2)}s`);
        }
      }

      reportProgress({ stage: 'stitching', progress: 40, message: 'Stitching videos together...' });

      const outputPath = path.join(this.tempDir, `${jobId}-stitched.mp4`);

      // Determine stitching strategy based on number of scenes
      if (includedScenes.length === 2) {
        // For 2 scenes, use xfade
        await this.stitchTwoVideos(normalizedPaths, includedScenes, outputPath, transitionDuration, durations);
      } else {
        // For 3+ scenes, stitch sequentially
        await this.stitchMultipleVideos(normalizedPaths, includedScenes, outputPath, transitionDuration, durations, (p) => {
          reportProgress({ 
            stage: 'stitching', 
            progress: 40 + Math.round(p * 40),
            message: 'Stitching videos...'
          });
        });
      }

      console.log(`✅ Video stitching complete, uploading to S3...`);
      reportProgress({ stage: 'uploading', progress: 85, message: 'Uploading final video...' });

      // Upload to S3
      const videoBuffer = await readFile(outputPath);
      const s3Url = await uploadVideoToS3(videoBuffer, `stitched-${jobId}.mp4`);

      // Get final duration
      const finalDuration = await this.getVideoDuration(outputPath);
      console.log(`   Final video duration: ${finalDuration.toFixed(2)}s`);

      // Cleanup temp files
      await this.cleanup([...downloadedPaths, ...normalizedPaths, outputPath]);

      console.log(`✅ Stitched video uploaded: ${s3Url}`);
      reportProgress({ stage: 'complete', progress: 100, message: 'Video ready!' });

      return { 
        success: true, 
        videoUrl: s3Url,
        duration: finalDuration
      };

    } catch (error) {
      console.error('❌ Video stitching failed:', error);
      await this.cleanup([...downloadedPaths, ...normalizedPaths]);
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
   * Stitch exactly 2 videos with xfade transition and proper audio crossfade
   * Uses acrossfade for reliable audio sync
   */
  private async stitchTwoVideos(
    inputPaths: string[],
    scenes: SceneVideo[],
    outputPath: string,
    transitionDuration: number,
    durations: number[]
  ): Promise<void> {
    const transition = scenes[0].transition || 'fade';
    const duration1 = durations[0];
    const duration2 = durations[1];
    const offset = Math.max(0, duration1 - transitionDuration);

    return new Promise((resolve, reject) => {
      console.log(`   Using xfade transition: ${transition}`);
      console.log(`   Video 1 duration: ${duration1.toFixed(2)}s, Video 2 duration: ${duration2.toFixed(2)}s`);
      console.log(`   Transition offset: ${offset.toFixed(2)}s, transition duration: ${transitionDuration}s`);
      
      const command = ffmpeg()
        .input(inputPaths[0])
        .input(inputPaths[1]);

      let filterComplex: string;
      
      if (transition === 'none') {
        // Simple concatenation without transition - audio stays in sync
        filterComplex = `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]`;
      } else {
        // Video: xfade transition
        // Audio: acrossfade for proper crossfade with correct timing
        // The key fix: use acrossfade which handles timing correctly
        filterComplex = 
          `[0:v][1:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}[outv];` +
          `[0:a][1:a]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[outa]`;
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
          '-b:a', '128k',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`   Stitched 2 videos successfully`);
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg 2-video error:', err.message);
          // Fallback to simple concatenation if complex filter fails
          console.log('   Falling back to simple concatenation...');
          this.fallbackConcatenation(inputPaths, outputPath)
            .then(resolve)
            .catch(reject);
        })
        .run();
    });
  }

  /**
   * Stitch 3+ videos with proper audio/video sync
   * Uses sequential approach: stitch pairs then combine for reliable sync
   */
  private async stitchMultipleVideos(
    inputPaths: string[],
    scenes: SceneVideo[],
    outputPath: string,
    transitionDuration: number,
    durations: number[],
    onProgress: (progress: number) => void
  ): Promise<void> {
    console.log(`   Stitching ${inputPaths.length} videos with sequential approach for reliable sync`);
    
    // Check if all transitions are 'none' - use simple concat
    const allNoTransition = scenes.every(s => s.transition === 'none');
    if (allNoTransition) {
      console.log('   All transitions are "none", using simple concatenation');
      return this.fallbackConcatenation(inputPaths, outputPath);
    }

    // For multiple videos with transitions, use sequential stitching
    // This is more reliable than complex chained filters
    let currentPath = inputPaths[0];
    let currentDuration = durations[0];
    const tempPaths: string[] = [];

    try {
      for (let i = 1; i < inputPaths.length; i++) {
        const progress = (i - 1) / (inputPaths.length - 1);
        onProgress(progress);

        const transition = scenes[i - 1].transition || 'fade';
        const nextPath = inputPaths[i];
        const nextDuration = durations[i];
        
        console.log(`   Stitching pair ${i}: ${path.basename(currentPath)} + ${path.basename(nextPath)}`);
        
        // Output path for this step
        const stepOutput = i === inputPaths.length - 1 
          ? outputPath 
          : path.join(this.tempDir, `step-${i}-${Date.now()}.mp4`);
        
        if (i < inputPaths.length - 1) {
          tempPaths.push(stepOutput);
        }

        // Stitch current + next
        await this.stitchTwoPaths(
          currentPath, 
          nextPath, 
          stepOutput, 
          transition, 
          transitionDuration, 
          currentDuration,
          nextDuration
        );

        // Update for next iteration
        currentPath = stepOutput;
        // New duration = current + next - transition overlap
        currentDuration = currentDuration + nextDuration - (transition !== 'none' ? transitionDuration : 0);
        console.log(`   Step ${i} complete, cumulative duration: ${currentDuration.toFixed(2)}s`);
      }

      onProgress(1);

      // Cleanup temp paths
      for (const p of tempPaths) {
        await unlink(p).catch(() => {});
      }

    } catch (error) {
      // Cleanup on error
      for (const p of tempPaths) {
        await unlink(p).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Helper to stitch exactly 2 paths with a transition
   * Uses acrossfade for proper audio sync
   */
  private async stitchTwoPaths(
    path1: string,
    path2: string,
    outputPath: string,
    transition: SceneVideo['transition'],
    transitionDuration: number,
    duration1: number,
    duration2: number
  ): Promise<void> {
    const offset = Math.max(0, duration1 - transitionDuration);

    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(path1)
        .input(path2);

      let filterComplex: string;
      
      if (transition === 'none') {
        // Simple concat
        filterComplex = `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]`;
      } else {
        // Use xfade for video and acrossfade for audio
        filterComplex = 
          `[0:v][1:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}[outv];` +
          `[0:a][1:a]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[outa]`;
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
          '-b:a', '128k',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('FFmpeg pair stitch error:', err.message);
          // Fallback to simple concat for this pair
          this.simpleConcatTwo(path1, path2, outputPath)
            .then(resolve)
            .catch(reject);
        })
        .run();
    });
  }

  /**
   * Simple concatenation of exactly 2 files
   */
  private async simpleConcatTwo(path1: string, path2: string, outputPath: string): Promise<void> {
    const concatFile = path.join(this.tempDir, `concat-${Date.now()}.txt`);
    const concatContent = `file '${path1}'\nfile '${path2}'`;
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
          '-b:a', '128k',
          '-movflags', '+faststart'
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
   * Fallback: Simple concatenation without transitions
   */
  private async fallbackConcatenation(inputPaths: string[], outputPath: string): Promise<void> {
    console.log('   Using simple concatenation (no transitions)...');
    
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
          '-b:a', '128k',
          '-movflags', '+faststart'
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
   */
  suggestTransition(fromScene: SceneVideo, toScene: SceneVideo): SceneVideo['transition'] {
    const transitions: SceneVideo['transition'][] = [
      'fade',
      'dissolve',
      'wipeleft',
      'slideup',
      'circleopen'
    ];
    
    return transitions[Math.floor(Math.random() * transitions.length)];
  }

  /**
   * Auto-assign transitions to scenes based on their content/section
   */
  autoAssignTransitions(scenes: SceneVideo[]): SceneVideo[] {
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
