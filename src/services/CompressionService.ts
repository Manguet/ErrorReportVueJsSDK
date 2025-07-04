export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // Minimum size in bytes to compress
  level: number; // Compression level (1-9)
}

export class CompressionService {
  private config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      enabled: true,
      threshold: 1024, // 1KB
      level: 6,
      ...config
    };
  }

  async compress(data: string): Promise<string | ArrayBuffer> {
    if (!this.config.enabled || data.length < this.config.threshold) {
      return data;
    }

    // Check if browser supports compression
    if (typeof window !== 'undefined' && 'CompressionStream' in window) {
      return this.compressWithCompressionStream(data);
    }

    // Fallback for environments without CompressionStream
    return this.compressWithPako(data);
  }

  private async compressWithCompressionStream(data: string): Promise<ArrayBuffer> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Write data to compression stream
    writer.write(new TextEncoder().encode(data));
    writer.close();

    // Read compressed data
    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }

    // Combine chunks into single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  private compressWithPako(data: string): string {
    // Simple base64 encoding as fallback
    // In a real implementation, you'd use pako or similar library
    if (typeof btoa !== 'undefined') {
      return btoa(data);
    }
    
    // Server-side fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64');
    }

    // If no compression available, return original
    return data;
  }

  getCompressionHeaders(isCompressed: boolean): Record<string, string> {
    if (!isCompressed) {
      return {};
    }

    return {
      'Content-Encoding': 'gzip',
      'Content-Type': 'application/json'
    };
  }

  estimateCompressionRatio(data: string): number {
    // Rough estimation based on text characteristics
    const uniqueChars = new Set(data).size;
    const totalChars = data.length;
    
    if (totalChars === 0) return 1;
    
    // More repetitive text compresses better
    const repetitionFactor = 1 - (uniqueChars / totalChars);
    
    // JSON typically compresses to 20-40% of original size
    const baseRatio = 0.3;
    const adjustedRatio = baseRatio * (1 - repetitionFactor * 0.5);
    
    return Math.min(1, Math.max(0.1, adjustedRatio));
  }

  updateConfig(updates: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): CompressionConfig {
    return { ...this.config };
  }
}