/**
 * LLM Usage Counter Service
 * Tracks API calls to various LLM endpoints
 * Persists data to PostgreSQL database for durability across restarts
 */

import prisma from '../lib/prisma';

export interface LLMUsageStats {
  textToText: number;
  textToImage: number;
  textToVideo: number;
  total: number;
  history: UsageRecord[];
}

export interface UsageRecord {
  id?: string;
  timestamp: Date;
  type: 'text-to-text' | 'text-to-image' | 'text-to-video';
  model: string;
  promptPreview: string;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
}

class LLMCounterService {
  // In-memory cache for faster reads (synced with DB)
  private textToTextCount: number = 0;
  private textToImageCount: number = 0;
  private textToVideoCount: number = 0;
  private history: UsageRecord[] = [];
  private maxHistorySize: number = 100;
  private initialized: boolean = false;
  private dbAvailable: boolean = true;

  /**
   * Initialize the counter by loading existing counts from the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load counts from database
      const counts = await prisma.$queryRaw<{ type: string; count: bigint }[]>`
        SELECT type, COUNT(*) as count 
        FROM llm_usage_records 
        GROUP BY type
      `;

      for (const row of counts) {
        const count = Number(row.count);
        switch (row.type) {
          case 'text-to-text':
            this.textToTextCount = count;
            break;
          case 'text-to-image':
            this.textToImageCount = count;
            break;
          case 'text-to-video':
            this.textToVideoCount = count;
            break;
        }
      }

      // Load recent history
      const records = await prisma.$queryRaw<any[]>`
        SELECT id, type, model, prompt_preview, success, duration_ms, error_message, created_at
        FROM llm_usage_records
        ORDER BY created_at DESC
        LIMIT ${this.maxHistorySize}
      `;

      this.history = records.map(r => ({
        id: r.id,
        timestamp: r.created_at,
        type: r.type as UsageRecord['type'],
        model: r.model,
        promptPreview: r.prompt_preview || '',
        success: r.success,
        durationMs: r.duration_ms,
        errorMessage: r.error_message
      }));

      this.dbAvailable = true;
      this.initialized = true;
      console.log(`📊 LLM Counter initialized from DB: ${this.textToTextCount} text, ${this.textToImageCount} image, ${this.textToVideoCount} video`);
    } catch (error) {
      console.warn('⚠️ Could not load LLM usage from database, using in-memory only:', error);
      this.dbAvailable = false;
      this.initialized = true;
    }
  }

  /**
   * Increment text-to-text counter and persist
   */
  async incrementTextToText(
    model: string, 
    success: boolean = true, 
    durationMs?: number, 
    promptPreview: string = '',
    errorMessage?: string
  ): Promise<void> {
    this.textToTextCount++;
    await this.addToHistory('text-to-text', model, promptPreview, success, durationMs, errorMessage);
    console.log(`📊 LLM Counter: text-to-text = ${this.textToTextCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Increment text-to-image counter and persist
   */
  async incrementTextToImage(
    model: string, 
    success: boolean = true, 
    durationMs?: number, 
    promptPreview: string = '',
    errorMessage?: string
  ): Promise<void> {
    this.textToImageCount++;
    await this.addToHistory('text-to-image', model, promptPreview, success, durationMs, errorMessage);
    console.log(`📊 LLM Counter: text-to-image = ${this.textToImageCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Increment text-to-video counter and persist
   */
  async incrementTextToVideo(
    model: string, 
    success: boolean = true, 
    durationMs?: number, 
    promptPreview: string = '',
    errorMessage?: string
  ): Promise<void> {
    this.textToVideoCount++;
    await this.addToHistory('text-to-video', model, promptPreview, success, durationMs, errorMessage);
    console.log(`📊 LLM Counter: text-to-video = ${this.textToVideoCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Add record to history and persist to database
   */
  private async addToHistory(
    type: 'text-to-text' | 'text-to-image' | 'text-to-video',
    model: string,
    promptPreview: string,
    success: boolean,
    durationMs?: number,
    errorMessage?: string
  ): Promise<void> {
    const truncatedPreview = promptPreview.substring(0, 100) + (promptPreview.length > 100 ? '...' : '');
    
    const record: UsageRecord = {
      timestamp: new Date(),
      type,
      model,
      promptPreview: truncatedPreview,
      success,
      durationMs,
      errorMessage
    };

    // Add to in-memory history
    this.history.unshift(record);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    // Persist to database (async, don't block)
    this.persistRecord(record).catch(err => {
      console.warn('⚠️ Failed to persist LLM usage record:', err);
    });
  }

  /**
   * Persist a single record to the database
   */
  private async persistRecord(record: UsageRecord): Promise<void> {
    if (!this.dbAvailable) return;

    try {
      await prisma.$executeRaw`
        INSERT INTO llm_usage_records (id, type, model, prompt_preview, success, duration_ms, error_message, created_at)
        VALUES (gen_random_uuid(), ${record.type}, ${record.model}, ${record.promptPreview}, ${record.success}, ${record.durationMs || null}, ${record.errorMessage || null}, ${record.timestamp})
      `;
    } catch (error) {
      // If DB fails, just log warning - data is still in memory
      console.warn('⚠️ Could not persist LLM usage record to database');
      this.dbAvailable = false;
    }
  }

  /**
   * Get current statistics (initializes from DB if needed)
   */
  async getStats(): Promise<LLMUsageStats> {
    await this.initialize();
    
    return {
      textToText: this.textToTextCount,
      textToImage: this.textToImageCount,
      textToVideo: this.textToVideoCount,
      total: this.textToTextCount + this.textToImageCount + this.textToVideoCount,
      history: this.history
    };
  }

  /**
   * Get breakdown by type
   */
  async getBreakdown(): Promise<{ type: string; count: number; percentage: number }[]> {
    await this.initialize();
    
    const total = this.textToTextCount + this.textToImageCount + this.textToVideoCount;
    
    return [
      {
        type: 'Text-to-Text',
        count: this.textToTextCount,
        percentage: total > 0 ? Math.round((this.textToTextCount / total) * 100) : 0
      },
      {
        type: 'Text-to-Image',
        count: this.textToImageCount,
        percentage: total > 0 ? Math.round((this.textToImageCount / total) * 100) : 0
      },
      {
        type: 'Text-to-Video',
        count: this.textToVideoCount,
        percentage: total > 0 ? Math.round((this.textToVideoCount / total) * 100) : 0
      }
    ];
  }

  /**
   * Get success rate
   */
  async getSuccessRate(): Promise<{ successful: number; failed: number; rate: number }> {
    await this.initialize();
    
    // Query from database for accurate counts
    if (this.dbAvailable) {
      try {
        const stats = await prisma.$queryRaw<{ success: boolean; count: bigint }[]>`
          SELECT success, COUNT(*) as count 
          FROM llm_usage_records 
          GROUP BY success
        `;

        let successful = 0;
        let failed = 0;
        for (const row of stats) {
          if (row.success) {
            successful = Number(row.count);
          } else {
            failed = Number(row.count);
          }
        }

        const total = successful + failed;
        return {
          successful,
          failed,
          rate: total > 0 ? Math.round((successful / total) * 100) : 100
        };
      } catch {
        // Fall back to in-memory
      }
    }

    const successful = this.history.filter(r => r.success).length;
    const failed = this.history.filter(r => !r.success).length;
    const total = successful + failed;

    return {
      successful,
      failed,
      rate: total > 0 ? Math.round((successful / total) * 100) : 100
    };
  }

  /**
   * Get average response time
   */
  async getAverageResponseTime(): Promise<{ textToText: number; textToImage: number; textToVideo: number; overall: number }> {
    await this.initialize();

    // Query from database for accurate averages
    if (this.dbAvailable) {
      try {
        const averages = await prisma.$queryRaw<{ type: string; avg_duration: number }[]>`
          SELECT type, AVG(duration_ms) as avg_duration 
          FROM llm_usage_records 
          WHERE duration_ms IS NOT NULL
          GROUP BY type
        `;

        const overallAvg = await prisma.$queryRaw<{ avg_duration: number }[]>`
          SELECT AVG(duration_ms) as avg_duration 
          FROM llm_usage_records 
          WHERE duration_ms IS NOT NULL
        `;

        const result: { textToText: number; textToImage: number; textToVideo: number; overall: number } = {
          textToText: 0,
          textToImage: 0,
          textToVideo: 0,
          overall: Math.round(overallAvg[0]?.avg_duration || 0)
        };

        for (const row of averages) {
          switch (row.type) {
            case 'text-to-text':
              result.textToText = Math.round(row.avg_duration || 0);
              break;
            case 'text-to-image':
              result.textToImage = Math.round(row.avg_duration || 0);
              break;
            case 'text-to-video':
              result.textToVideo = Math.round(row.avg_duration || 0);
              break;
          }
        }

        return result;
      } catch {
        // Fall back to in-memory
      }
    }

    const calcAverage = (records: UsageRecord[]): number => {
      const withDuration = records.filter(r => r.durationMs !== undefined);
      if (withDuration.length === 0) return 0;
      const sum = withDuration.reduce((acc, r) => acc + (r.durationMs || 0), 0);
      return Math.round(sum / withDuration.length);
    };

    const textToTextRecords = this.history.filter(r => r.type === 'text-to-text');
    const textToImageRecords = this.history.filter(r => r.type === 'text-to-image');
    const textToVideoRecords = this.history.filter(r => r.type === 'text-to-video');

    return {
      textToText: calcAverage(textToTextRecords),
      textToImage: calcAverage(textToImageRecords),
      textToVideo: calcAverage(textToVideoRecords),
      overall: calcAverage(this.history)
    };
  }

  /**
   * Reset all counters (for testing/admin purposes)
   * Also clears database records
   */
  async reset(): Promise<void> {
    this.textToTextCount = 0;
    this.textToImageCount = 0;
    this.textToVideoCount = 0;
    this.history = [];

    if (this.dbAvailable) {
      try {
        await prisma.$executeRaw`DELETE FROM llm_usage_records`;
        console.log('📊 LLM Counter: All counters reset (including database)');
      } catch (error) {
        console.warn('⚠️ Could not clear database records:', error);
      }
    } else {
      console.log('📊 LLM Counter: In-memory counters reset');
    }
  }

  /**
   * Get recent history with optional limit
   */
  async getHistory(limit: number = 50): Promise<UsageRecord[]> {
    await this.initialize();

    if (this.dbAvailable) {
      try {
        const records = await prisma.$queryRaw<any[]>`
          SELECT id, type, model, prompt_preview, success, duration_ms, error_message, created_at
          FROM llm_usage_records
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

        return records.map(r => ({
          id: r.id,
          timestamp: r.created_at,
          type: r.type as UsageRecord['type'],
          model: r.model,
          promptPreview: r.prompt_preview || '',
          success: r.success,
          durationMs: r.duration_ms,
          errorMessage: r.error_message
        }));
      } catch {
        // Fall back to in-memory
      }
    }

    return this.history.slice(0, limit);
  }
}

// Export singleton instance
export const llmCounter = new LLMCounterService();
