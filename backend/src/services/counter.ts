/**
 * LLM Usage Counter Service
 * Tracks API calls to various LLM endpoints
 */

export interface LLMUsageStats {
  textToText: number;
  textToImage: number;
  textToVideo: number;
  total: number;
  history: UsageRecord[];
}

export interface UsageRecord {
  timestamp: Date;
  type: 'text-to-text' | 'text-to-image' | 'text-to-video';
  model: string;
  promptPreview: string;
  success: boolean;
  durationMs?: number;
}

class LLMCounterService {
  private textToTextCount: number = 0;
  private textToImageCount: number = 0;
  private textToVideoCount: number = 0;
  private history: UsageRecord[] = [];
  private maxHistorySize: number = 100; // Keep last 100 records

  /**
   * Increment text-to-text counter
   */
  incrementTextToText(model: string, success: boolean = true, durationMs?: number, promptPreview: string = ''): void {
    this.textToTextCount++;
    this.addToHistory('text-to-text', model, promptPreview, success, durationMs);
    console.log(`📊 LLM Counter: text-to-text = ${this.textToTextCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Increment text-to-image counter
   */
  incrementTextToImage(model: string, success: boolean = true, durationMs?: number, promptPreview: string = ''): void {
    this.textToImageCount++;
    this.addToHistory('text-to-image', model, promptPreview, success, durationMs);
    console.log(`📊 LLM Counter: text-to-image = ${this.textToImageCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Increment text-to-video counter
   */
  incrementTextToVideo(model: string, success: boolean = true, durationMs?: number, promptPreview: string = ''): void {
    this.textToVideoCount++;
    this.addToHistory('text-to-video', model, promptPreview, success, durationMs);
    console.log(`📊 LLM Counter: text-to-video = ${this.textToVideoCount} (${success ? 'success' : 'failed'})`);
  }

  /**
   * Add record to history
   */
  private addToHistory(
    type: 'text-to-text' | 'text-to-image' | 'text-to-video',
    model: string,
    promptPreview: string,
    success: boolean,
    durationMs?: number
  ): void {
    const record: UsageRecord = {
      timestamp: new Date(),
      type,
      model,
      promptPreview: promptPreview.substring(0, 100) + (promptPreview.length > 100 ? '...' : ''),
      success,
      durationMs
    };

    this.history.unshift(record); // Add to beginning

    // Keep only the last N records
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): LLMUsageStats {
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
  getBreakdown(): { type: string; count: number; percentage: number }[] {
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
  getSuccessRate(): { successful: number; failed: number; rate: number } {
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
  getAverageResponseTime(): { textToText: number; textToImage: number; textToVideo: number; overall: number } {
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
   */
  reset(): void {
    this.textToTextCount = 0;
    this.textToImageCount = 0;
    this.textToVideoCount = 0;
    this.history = [];
    console.log('📊 LLM Counter: All counters reset');
  }
}

// Export singleton instance
export const llmCounter = new LLMCounterService();
