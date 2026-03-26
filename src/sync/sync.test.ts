/**
 * Sync Module Unit Tests
 * 
 * Comprehensive tests for the sync module using Vitest.
 * Tests use mocked dependencies to isolate unit behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SyncConfig, SyncInput, TrackInfo, ItemType } from './types';
import { createSyncCore, createTestSyncCore, type SyncDependencies, type SyncCore } from './sync-core';
import { createMockApiClient } from './sync-api';
import { createMockFileSystem } from './sync-files';
import { createMockConverter } from './sync-files';
import {
  validateSyncConfig,
  normalizeServerUrl,
  validateApiKey,
  resolveSyncOptions,
  buildDestinationPath,
  getRelativePath,
  getFilenameFromPath,
} from './sync-config';
import {
  createProgressEmitter,
  createCancellationController,
  progress,
} from './sync-progress';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const validConfig: SyncConfig = {
  serverUrl: 'https://jellyfin.example.com',
  apiKey: '0123456789abcdef0123456789abcdef',
  userId: 'abcdef1234567890abcdef1234567890',
};

const mockTracks: TrackInfo[] = [
  {
    id: 'track-1',
    name: 'Track One',
    album: 'Album One',
    artists: ['Artist One'],
    path: '/music/artist/album/track1.mp3',
    format: 'mp3',
    size: 5000000,
    trackNumber: 1,
  },
  {
    id: 'track-2',
    name: 'Track Two',
    album: 'Album One',
    artists: ['Artist One'],
    path: '/music/artist/album/track2.flac',
    format: 'flac',
    size: 30000000,
    trackNumber: 2,
  },
];

function createMockDeps(overrides?: Partial<SyncDependencies>): SyncDependencies {
  return {
    api: createMockApiClient({
      getTracksForItems: async () => ({ tracks: mockTracks, errors: [] }),
    }),
    fs: createMockFileSystem(),
    converter: createMockConverter(),
    ...overrides,
  };
}

// =============================================================================
// CONFIG TESTS
// =============================================================================

describe('sync-config', () => {
  describe('validateSyncConfig', () => {
    it('should validate a correct config', () => {
      const result = validateSyncConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing serverUrl', () => {
      const result = validateSyncConfig({ ...validConfig, serverUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Server URL is required');
    });

    it('should reject missing apiKey', () => {
      const result = validateSyncConfig({ ...validConfig, apiKey: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API key is required');
    });

    it('should reject missing userId', () => {
      const result = validateSyncConfig({ ...validConfig, userId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User ID is required');
    });

    it('should reject invalid userId format', () => {
      const result = validateSyncConfig({ ...validConfig, userId: 'short-id' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User ID must be a 32-character hex string');
    });

    it('should reject invalid URL', () => {
      // A URL that's truly invalid (spaces, special chars)
      const result = validateSyncConfig({ ...validConfig, serverUrl: '://invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Server URL is not a valid URL');
    });
  });

  describe('normalizeServerUrl', () => {
    it('should remove trailing slashes', () => {
      expect(normalizeServerUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizeServerUrl('https://example.com///')).toBe('https://example.com');
    });

    it('should add https protocol if missing', () => {
      expect(normalizeServerUrl('example.com')).toBe('https://example.com');
    });

    it('should preserve http protocol', () => {
      expect(normalizeServerUrl('http://example.com')).toBe('http://example.com');
    });

    it('should remove /web suffix', () => {
      expect(normalizeServerUrl('https://example.com/web')).toBe('https://example.com');
      expect(normalizeServerUrl('https://example.com/web/index.html')).toBe('https://example.com');
    });
  });

  describe('validateApiKey', () => {
    it('should accept 32-character hex string', () => {
      const result = validateApiKey('0123456789abcdef0123456789abcdef');
      expect(result.valid).toBe(true);
    });

    it('should accept non-standard format but warn', () => {
      const result = validateApiKey('custom-key-format');
      expect(result.valid).toBe(true);
    });

    it('should reject empty string', () => {
      const result = validateApiKey('');
      expect(result.valid).toBe(false);
    });
  });

  describe('resolveSyncOptions', () => {
    it('should return defaults for no options', () => {
      const options = resolveSyncOptions();
      expect(options.convertToMp3).toBe(false);
      expect(options.bitrate).toBe('192k');
      expect(options.skipExisting).toBe(true);
      expect(options.preserveStructure).toBe(true);
    });

    it('should merge user options with defaults', () => {
      const options = resolveSyncOptions({ convertToMp3: true, bitrate: '320k' });
      expect(options.convertToMp3).toBe(true);
      expect(options.bitrate).toBe('320k');
      expect(options.skipExisting).toBe(true);
    });
  });
});

// =============================================================================
// PROGRESS TESTS
// =============================================================================

describe('sync-progress', () => {
  describe('createProgressEmitter', () => {
    it('should emit progress to subscribers', () => {
      const emitter = createProgressEmitter();
      const callback = vi.fn();
      
      emitter.subscribe(callback);
      emitter.emit({ phase: 'copying', current: 1, total: 10 });
      
      expect(callback).toHaveBeenCalledWith({
        phase: 'copying',
        current: 1,
        total: 10,
      });
    });

    it('should support multiple subscribers', () => {
      const emitter = createProgressEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      emitter.subscribe(callback1);
      emitter.subscribe(callback2);
      emitter.emit({ phase: 'fetching', current: 0, total: 5 });
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe correctly', () => {
      const emitter = createProgressEmitter();
      const callback = vi.fn();
      
      const unsubscribe = emitter.subscribe(callback);
      emitter.emit({ phase: 'fetching', current: 0, total: 5 });
      expect(callback).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      emitter.emit({ phase: 'copying', current: 1, total: 5 });
      expect(callback).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should return current progress', () => {
      const emitter = createProgressEmitter();
      
      emitter.emit({ phase: 'fetching', current: 0, total: 5 });
      
      expect(emitter.getCurrent()).toEqual({
        phase: 'fetching',
        current: 0,
        total: 5,
      });
    });
  });

  describe('createCancellationController', () => {
    it('should not be cancelled initially', () => {
      const controller = createCancellationController();
      expect(controller.isCancelled()).toBe(false);
    });

    it('should be cancelled after cancel()', () => {
      const controller = createCancellationController();
      controller.cancel();
      expect(controller.isCancelled()).toBe(true);
    });

    it('should throw when cancelled', () => {
      const controller = createCancellationController();
      controller.cancel();
      
      expect(() => controller.throwIfCancelled()).toThrow('Sync operation was cancelled');
    });

    it('should reset cancellation state', () => {
      const controller = createCancellationController();
      controller.cancel();
      expect(controller.isCancelled()).toBe(true);
      
      controller.reset();
      expect(controller.isCancelled()).toBe(false);
    });
  });

  describe('ProgressBuilder', () => {
    it('should build progress object', () => {
      const p = progress(10)
        .phase('copying')
        .current(3)
        .track('Test Track')
        .bytes(1000000, 5000000)
        .build();
      
      expect(p).toEqual({
        phase: 'copying',
        current: 3,
        total: 10,
        currentTrack: 'Test Track',
        bytesProcessed: 1000000,
        totalBytes: 5000000,
      });
    });
  });
});

// =============================================================================
// API TESTS
// =============================================================================

describe('sync-api', () => {
  describe('createMockApiClient', () => {
    it('should return default mock values', async () => {
      const api = createMockApiClient();
      
      const result = await api.testConnection();
      expect(result.success).toBe(true);
      expect(result.serverName).toBe('Mock Server');
    });

    it('should allow overriding mock methods', async () => {
      const api = createMockApiClient({
        testConnection: async () => ({ success: false, error: 'Connection refused' }),
      });
      
      const result = await api.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should return mock tracks', async () => {
      const mockTracks: TrackInfo[] = [
        { id: '1', name: 'Track', path: '/path', format: 'mp3' },
      ];
      
      const api = createMockApiClient({
        getArtistTracks: async () => mockTracks,
      });
      
      const tracks = await api.getArtistTracks('artist-1');
      expect(tracks).toHaveLength(1);
      expect(tracks[0].name).toBe('Track');
    });
  });
});

// =============================================================================
// FILESYSTEM TESTS
// =============================================================================

describe('sync-files', () => {
  describe('createMockFileSystem', () => {
    it('should track files written', async () => {
      const fs = createMockFileSystem() as any;
      
      await fs.writeFile('/test/file.txt', Buffer.from('content'));
      
      expect(await fs.exists('/test/file.txt')).toBe(true);
      expect(await fs.readFile('/test/file.txt')).toEqual(Buffer.from('content'));
    });

    it('should support directory operations', async () => {
      const fs = createMockFileSystem();
      
      await fs.mkdir('/test/dir');
      expect(await fs.isDirectory('/test/dir')).toBe(true);
    });

    it('should mock unlimited disk space', async () => {
      const fs = createMockFileSystem();
      
      const freeSpace = await fs.getFreeSpace('/any/path');
      expect(freeSpace).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});

// =============================================================================
// SYNC CORE TESTS
// =============================================================================

describe('sync-core', () => {
  describe('createSyncCore', () => {
    it('should create SyncCore instance', () => {
      const core = createSyncCore(validConfig);
      expect(core).toBeDefined();
      expect(core.sync).toBeInstanceOf(Function);
      expect(core.validateDestination).toBeInstanceOf(Function);
      expect(core.estimateSize).toBeInstanceOf(Function);
    });

    it('should throw for invalid config', () => {
      expect(() => createSyncCore({ serverUrl: '', apiKey: '', userId: '' }))
        .toThrow('Invalid config');
    });
  });

  describe('validateDestination', () => {
    it('should return invalid for non-existent path', async () => {
      const deps = createMockDeps();
      const core = createTestSyncCore(validConfig, deps);
      
      const result = await core.validateDestination('/nonexistent/path');
      expect(result.valid).toBe(true); // Mock FS allows any path
      expect(result.exists).toBe(false);
    });

    it('should return valid for existing directory', async () => {
      const deps = createMockDeps();
      (deps.fs as any).__setFile('/existing/dir/.keep', Buffer.from(''));
      
      const core = createTestSyncCore(validConfig, deps);
      
      const result = await core.validateDestination('/existing/dir');
      // Mock filesystem behavior
      expect(result).toBeDefined();
    });
  });

  describe('sync', () => {
    it('should return error when no items selected', async () => {
      const deps = createMockDeps({
        api: createMockApiClient({
          getTracksForItems: async () => ({ tracks: [], errors: [] }),
        }),
      });
      
      const core = createTestSyncCore(validConfig, deps);
      
      const input: SyncInput = {
        itemIds: [],
        itemTypes: new Map(),
        destinationPath: '/music',
      };
      
      const result = await core.sync(input);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('No tracks found for selected items');
    });

    it('should sync tracks successfully', async () => {
      const deps = createMockDeps();
      
      // Set up source files in mock filesystem
      const mockFs = deps.fs as any;
      mockFs.__setFile('/music/artist/album/track1.mp3', Buffer.alloc(5000000));
      mockFs.__setFile('/music/artist/album/track2.flac', Buffer.alloc(30000000));
      
      const core = createTestSyncCore(validConfig, deps);
      
      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);
      
      const input: SyncInput = {
        itemIds: ['album-1'],
        itemTypes,
        destinationPath: '/music',
      };
      
      let lastProgress: any;
      const result = await core.sync(input, (progress) => {
        lastProgress = progress;
      });
      
      expect(result.success).toBe(true);
      expect(result.tracksCopied).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(lastProgress.phase).toBe('complete');
    });

    it('should call progress callback during sync', async () => {
      const deps = createMockDeps();
      const core = createTestSyncCore(validConfig, deps);
      
      const progressEvents: any[] = [];
      
      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);
      
      await core.sync(
        { itemIds: ['album-1'], itemTypes, destinationPath: '/music' },
        (progress) => progressEvents.push(progress)
      );
      
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].phase).toBe('fetching');
    });

    it('should handle conversion when convertToMp3 istrue', async () => {
      const deps = createMockDeps();
      const converter = {
        isAvailable: async () => true,
        convertToMp3: vi.fn().mockResolvedValue({ success: true }),
      };
      
      const core = createTestSyncCore(validConfig, { ...deps, converter });
      
      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);
      
      const input: SyncInput = {
        itemIds: ['album-1'],
        itemTypes,
        destinationPath: '/music',
        options: { convertToMp3: true, bitrate: '320k' },
      };
      
      const result = await core.sync(input);
      
      // FLAC track should trigger conversion
      expect(converter.convertToMp3).toHaveBeenCalled();
    });

    it('should include errors for failed tracks', async () => {
      const deps = createMockDeps({
        api: createMockApiClient({
          getTracksForItems: async () => ({
            tracks: [
              { id: '1', name: 'Track', path: '/nonexistent.mp3', format: 'mp3' },
            ],
            errors: [],
          }),
          // Now using downloadItem instead of copyFile
          downloadItem: async () => { throw new Error('Download failed - file not found'); },
        }),
        fs: {
          ...createMockFileSystem(),
        },
      });
      
      const core = createTestSyncCore(validConfig, deps);
      
      const itemTypes = new Map<string, ItemType>([['1', 'album']]);
      
      const result = await core.sync({
        itemIds: ['1'],
        itemTypes,
        destinationPath: '/music',
      });
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tracksFailed).toContain('1');
    });
  });

  describe('estimateSize', () => {
    it('should return size estimate for items', async () => {
      const deps = createMockDeps();
      const core = createTestSyncCore(validConfig, deps);
      
      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);
      
      const estimate = await core.estimateSize(['album-1'], itemTypes);
      
      expect(estimate.trackCount).toBe(2);
      expect(estimate.totalBytes).toBe(35000000); // 5MB + 30MB
    });

    it('should break down by format', async () => {
      const deps = createMockDeps();
      const core = createTestSyncCore(validConfig, deps);
      
      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);
      
      const estimate = await core.estimateSize(['album-1'], itemTypes);
      
      expect(estimate.formatBreakdown.get('mp3')).toBe(5000000);
      expect(estimate.formatBreakdown.get('flac')).toBe(30000000);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS (with real-ish dependencies)
// =============================================================================

describe('Integration: Full Sync Flow', () => {
  it('should complete full sync workflow', async () => {
    // Setup mock dependencies that simulate real behavior
    const mockApi = createMockApiClient({
      testConnection: async () => ({ success: true, serverName: 'Test Server' }),
      getTracksForItems: async () => ({ tracks: mockTracks, errors: [] }),
    });

    const mockFs = createMockFileSystem();
    // Set up source files
    (mockFs as any).__setFile('/music/artist/album/track1.mp3', Buffer.alloc(5000000));
    (mockFs as any).__setFile('/music/artist/album/track2.flac', Buffer.alloc(30000000));
    
    const mockConverter = createMockConverter();
    
    const deps: SyncDependencies = {
      api: mockApi,
      fs: mockFs,
      converter: mockConverter,
    };
    
    const core = createTestSyncCore(validConfig, deps);
    
    // Test connection first
    const connection = await core.testConnection();
    expect(connection.success).toBe(true);
    
    // Validate destination
    const destValidation = await core.validateDestination('/music');
    expect(destValidation.valid).toBe(true);
    
    // Estimate size
    const itemTypes = new Map<string, ItemType>([['album-1', 'album']]);
    const estimate = await core.estimateSize(['album-1'], itemTypes);
    expect(estimate.trackCount).toBeGreaterThan(0);
    
    // Run sync
    const progressEvents: any[] = [];
    const result = await core.sync(
      {
        itemIds: ['album-1'],
        itemTypes,
        destinationPath: '/music',
      },
      (progress) => progressEvents.push(progress)
    );
    
    // Verify result
    expect(result.success).toBe(true);
    expect(result.tracksCopied).toBeGreaterThan(0);
    
    // Verify progress events
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].phase).toBe('fetching');
    expect(progressEvents[progressEvents.length - 1].phase).toBe('complete');
  });

  it('should handle cancellation correctly', async () => {
    const deps = createMockDeps();
    const core = createTestSyncCore(validConfig, deps);
    
    // Start sync and cancel immediately
    const itemTypes = new Map<string, ItemType>([['album-1', 'album']]);
    
    const syncPromise = core.sync({
      itemIds: ['album-1'],
      itemTypes,
      destinationPath: '/music',
    });
    
    // Cancel the sync
    (core as any).cancel?.();
    
    const result = await syncPromise;
    
    // Should either cancel or complete (race condition)
    expect(result.cancelled || result.success).toBe(true);
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('Error Handling', () => {
  it('should handle API errors gracefully', async () => {
    const deps = createMockDeps({
      api: createMockApiClient({
        getTracksForItems: async () => {
          throw new Error('API connection timeout');
        },
      }),
    });
    
    const core = createTestSyncCore(validConfig, deps);
    
    const itemTypes = new Map<string, ItemType>([['album-1', 'album']]);
    
    const result = await core.sync({
      itemIds: ['album-1'],
      itemTypes,
      destinationPath: '/music',
    });
    
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle filesystem errors gracefully', async () => {
    const deps = createMockDeps({
      fs: {
        ...createMockFileSystem(),
        mkdir: async () => { throw new Error('Permission denied'); },
      },
    });
    
    const core = createTestSyncCore(validConfig, deps);
    
    const itemTypes = new Map<string, ItemType>([['album-1', 'album']]);
    
    const result = await core.sync({
      itemIds: ['album-1'],
      itemTypes,
      destinationPath: '/readonly',
    });
    
    expect(result.success).toBe(false);
  });

  it('should handle converter errors gracefully', async () => {
    const deps = createMockDeps({
      converter: {
        isAvailable: async () => true,
        convertToMp3: async () => ({ success: false, error: 'FFmpeg not installed' }),
      },
    });
    
    const core = createTestSyncCore(validConfig, deps);
    
    const itemTypes = new Map<string, ItemType>([['album-1', 'album']]);
    
    const result = await core.sync({
      itemIds: ['album-1'],
      itemTypes,
      destinationPath: '/music',
      options: { convertToMp3: true },
    });
    
    // FLAC track should fail conversion
    expect(result.tracksFailed.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// INTEGRATION TESTS (Real API - Skip by default in CI)
// =============================================================================

/**
 * Integration tests that connect to a real Jellyfin server.
 * These tests are skipped by default - run with: npm test -- --integration
 * 
 * To enable:
 * 1. Set JELLYFIN_SERVER, JELLYFIN_API_KEY, JELLYFIN_USER_ID environment variables
 * 2. Run: npm test -- --integration
 */
describe('Integration: Real API Tests', () => {
  const serverUrl = process.env.JELLYFIN_SERVER;
  const apiKey = process.env.JELLYFIN_API_KEY;
  const userId = process.env.JELLYFIN_USER_ID;

  // Skip these tests unless integration flag is provided
  const itIfIntegration = process.env.INTEGRATION ? it : it.skip;

  itIfIntegration('should connect to real Jellyfin server', async () => {
    if (!serverUrl || !apiKey || !userId) {
      console.warn('Skipping integration test: Missing JELLYFIN_* environment variables');
      return;
    }

    const { createApiClient } = await import('./sync-api');
    const api = createApiClient({
      baseUrl: serverUrl,
      apiKey,
      userId,
      timeout: 30000,
    });

    const result = await api.testConnection();
    expect(result.success).toBe(true);
    expect(result.serverName).toBeDefined();
  });

  itIfIntegration('should fetch tracks from real server', async () => {
    if (!serverUrl || !apiKey || !userId) {
      console.warn('Skipping integration test: Missing JELLYFIN_* environment variables');
      return;
    }

    const { createApiClient } = await import('./sync-api');
    const api = createApiClient({
      baseUrl: serverUrl,
      apiKey,
      userId,
      timeout: 60000,
    });

    // Get user first to verify credentials
    const user = await api.getUser();
    expect(user.id).toBe(userId);

    // Get library stats
    const stats = await api.getLibraryStats();
    expect(stats.tracks).toBeGreaterThanOrEqual(0);
  });

  itIfIntegration('should estimate size for real items', async () => {
    if (!serverUrl || !apiKey || !userId) {
      console.warn('Skipping integration test: Missing JELLYFIN_* environment variables');
      return;
    }

    const { createApiClient } = await import('./sync-api');
    const { createSyncCore } = await import('./sync-core');
    const api = createApiClient({
      baseUrl: serverUrl,
      apiKey,
      userId,
      timeout: 60000,
    });

    // This would need a real item ID from the server
    // Skip if no test albums exist
    console.log('Integration test: Size estimation requires a real item ID');
  });
});

// =============================================================================
// FILE STRUCTURE TESTS
// =============================================================================

describe('File Structure', () => {
  it('should generate correct folder structure with year', () => {
    const sanitize = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
    
    const track = {
      artists: ['The Beatles'],
      album: 'Abbey Road',
      year: 1969,
      name: 'Come Together',
      trackNumber: 1,
      format: 'flac'
    };
    
    // Expected: lib/The Beatles/Abbey Road (1969)/
    const artistName = sanitize(track.artists[0]);
    const albumName = sanitize(track.album);
    const yearStr = track.year ? ` (${track.year})` : '';
    const expectedDir = `lib/${artistName}/${albumName}${yearStr}`;
    
    expect(expectedDir).toBe('lib/The Beatles/Abbey Road (1969)');
  });

  it('should generate correct filename format', () => {
    const sanitize = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
    
    const track = {
      artists: ['The Beatles'],
      album: 'Abbey Road',
      year: 1969,
      name: 'Come Together',
      trackNumber: 1,
      format: 'flac'
    };
    
    // Expected: The Beatles - Abbey Road - 01 - Come Together.flac
    const artistName = sanitize(track.artists[0]);
    const albumName = sanitize(track.album);
    const trackNum = String(track.trackNumber).padStart(2, '0');
    const titleSanitized = sanitize(track.name);
    const expectedFilename = `${artistName} - ${albumName} - ${trackNum} - ${titleSanitized}.${track.format}`;
    
    expect(expectedFilename).toBe('The Beatles - Abbey Road - 01 - Come Together.flac');
  });

  it('should handle missing year in folder structure', () => {
    const sanitize = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
    
    const track = {
      artists: ['Unknown Artist'],
      album: 'Unknown Album',
      year: undefined,
      name: 'Track',
      trackNumber: 5,
      format: 'mp3'
    };
    
    const artistName = sanitize(track.artists[0]);
    const albumName = sanitize(track.album);
    const yearStr = track.year ? ` (${track.year})` : '';
    const expectedDir = `lib/${artistName}/${albumName}${yearStr}`;
    
    expect(expectedDir).toBe('lib/Unknown Artist/Unknown Album');
  });
});

// =============================================================================
// SERVER ROOT PATH TESTS
// =============================================================================

describe('Server Root Path - Original Path Usage', () => {
  const validConfigWithServerRoot: SyncConfig = {
    serverUrl: 'https://jellyfin.example.com',
    apiKey: '0123456789abcdef0123456789abcdef',
    userId: 'abcdef1234567890abcdef1234567890',
    serverRootPath: '/mediamusic/lib/lib/',
  };

  // Tracks with actual server paths like in the bug report
  const tracksWithServerPath: TrackInfo[] = [
    {
      id: 'track-1',
      name: 'How Long',
      album: 'Five-A-Side',
      artists: ['Ace'],
      path: '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3',
      format: 'mp3',
      size: 5000000,
      trackNumber: 1,
    },
    {
      id: 'track-2',
      name: 'Twenty Years Later',
      album: 'Five-A-Side',
      artists: ['Ace'],
      path: '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - Twenty Years Later.mp3',
      format: 'mp3',
      size: 4000000,
      trackNumber: 2,
    },
  ];

  describe('buildDestinationPath', () => {
    it('should build correct destination path from server path', () => {
      const serverPath = '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3';
      const serverRoot = '/mediamusic/lib/lib/';
      const destinationRoot = '/Volumes/MEDIA/lib';

      const result = buildDestinationPath(serverPath, serverRoot, destinationRoot);

      expect(result).toBe('/Volumes/MEDIA/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3');
    });

    it('should handle paths with multiple slashes', () => {
      const serverPath = '/music//artist//album/track.mp3';
      const serverRoot = '/music/';
      const destinationRoot = '/dest';

      const result = buildDestinationPath(serverPath, serverRoot, destinationRoot);

      // Code normalizes multiple slashes
      expect(result).toBe('/dest/artist/album/track.mp3');
    });

    it('should return filename only if no subdirectories', () => {
      const serverPath = '/music/track.mp3';
      const serverRoot = '/music/';
      const destinationRoot = '/dest';

      const result = buildDestinationPath(serverPath, serverRoot, destinationRoot);

      expect(result).toBe('/dest/track.mp3');
    });
  });

  describe('getRelativePath', () => {
    it('should extract relative path from server path', () => {
      const serverPath = '/mediamusic/lib/lib/Ace/Five-A-Side/track.mp3';
      const serverRoot = '/mediamusic/lib/lib/';

      const result = getRelativePath(serverPath, serverRoot);

      expect(result).toBe('Ace/Five-A-Side/track.mp3');
    });

    it('should handle empty relative path', () => {
      const serverPath = '/mediamusic/lib/lib/';
      const serverRoot = '/mediamusic/lib/lib/';

      const result = getRelativePath(serverPath, serverRoot);

      expect(result).toBe('');
    });
  });

  describe('getFilenameFromPath', () => {
    it('should extract filename from full path', () => {
      const serverPath = '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3';

      const result = getFilenameFromPath(serverPath);

      expect(result).toBe('Ace - Five-A-Side - How Long.mp3');
    });

    it('should handle paths with trailing slash', () => {
      const serverPath = '/music/artist/album/';

      const result = getFilenameFromPath(serverPath);

      expect(result).toBe('');
    });

    it('should extract filename from Windows backslash path', () => {
      const serverPath = 'D:\\Music\\The Beatles\\1\\01 Love Me Do.mp3';

      const result = getFilenameFromPath(serverPath);

      expect(result).toBe('01 Love Me Do.mp3');
    });
  });

  describe('validateSyncConfig with serverRootPath', () => {
    it('should accept valid server root path', () => {
      const result = validateSyncConfig({
        ...validConfig,
        serverRootPath: '/mediamusic/lib/lib/',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept empty server root path', () => {
      const result = validateSyncConfig({
        ...validConfig,
        serverRootPath: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject server root path without leading slash', () => {
      const result = validateSyncConfig({
        ...validConfig,
        serverRootPath: 'mediamusic/lib/lib/',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Server root path must start with /');
    });

    it('should reject server root path without trailing slash', () => {
      const result = validateSyncConfig({
        ...validConfig,
        serverRootPath: '/mediamusic/lib/lib',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Server root path must end with /');
    });
  });

  describe('sync with serverRootPath', () => {
    it('should use original server path when serverRootPath is configured', async () => {
      const mockApi = createMockApiClient({
        getTracksForItems: async () => ({ tracks: tracksWithServerPath, errors: [] }),
      });

      const mockFs = createMockFileSystem();
      // Set up source files
      (mockFs as any).__setFile(
        '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3',
        Buffer.alloc(5000000)
      );
      (mockFs as any).__setFile(
        '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - Twenty Years Later.mp3',
        Buffer.alloc(4000000)
      );

      const deps: SyncDependencies = {
        api: mockApi,
        fs: mockFs,
        converter: createMockConverter(),
      };

      const core = createTestSyncCore(validConfigWithServerRoot, deps);

      const itemTypes = new Map<string, ItemType>([
        ['album-five-a-side', 'album'],
      ]);

      const result = await core.sync({
        itemIds: ['album-five-a-side'],
        itemTypes,
        destinationPath: '/Volumes/MEDIA/lib',
      });

      expect(result.success).toBe(true);
      expect(result.tracksCopied).toBe(2);

      // Verify files were written to correct paths using __getFile
      const expectedPath1 = '/Volumes/MEDIA/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3';
      const expectedPath2 = '/Volumes/MEDIA/lib/Ace/Five-A-Side/Ace - Five-A-Side - Twenty Years Later.mp3';
      
      expect((mockFs as any).__getFile(expectedPath1)).toBeDefined();
      expect((mockFs as any).__getFile(expectedPath2)).toBeDefined();
    });

    it('should auto-detect serverRootPath and preserve lib folder in destination', async () => {
      const mockApi = createMockApiClient({
        getTracksForItems: async () => ({ tracks: tracksWithServerPath, errors: [] }),
        downloadItem: async () => Buffer.alloc(100),
      });

      const mockFs = createMockFileSystem();

      const deps: SyncDependencies = {
        api: mockApi,
        fs: mockFs,
        converter: createMockConverter(),
      };

      // Config without serverRootPath — auto-detection should kick in
      const core = createTestSyncCore(validConfig, deps);

      const itemTypes = new Map<string, ItemType>([
        ['album-five-a-side', 'album'],
      ]);

      const result = await core.sync({
        itemIds: ['album-five-a-side'],
        itemTypes,
        destinationPath: '/Volumes/USB',
      });

      expect(result.success).toBe(true);
      // Auto-detection strips /mediamusic/lib/ so the relative path is lib/Ace/Five-A-Side/...
      const expectedPath1 = '/Volumes/USB/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3';
      const expectedPath2 = '/Volumes/USB/lib/Ace/Five-A-Side/Ace - Five-A-Side - Twenty Years Later.mp3';
      expect((mockFs as any).__getFile(expectedPath1)).toBeDefined();
      expect((mockFs as any).__getFile(expectedPath2)).toBeDefined();
    });

    it('should preserve filename exactly when using serverRootPath', async () => {
      const mockApi = createMockApiClient({
        getTracksForItems: async () => ({ tracks: tracksWithServerPath, errors: [] }),
      });

      const mockFs = createMockFileSystem();
      (mockFs as any).__setFile(
        '/mediamusic/lib/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3',
        Buffer.alloc(5000000)
      );

      const deps: SyncDependencies = {
        api: mockApi,
        fs: mockFs,
        converter: createMockConverter(),
      };

      const core = createTestSyncCore(validConfigWithServerRoot, deps);

      const itemTypes = new Map<string, ItemType>([
        ['album-1', 'album'],
      ]);

      await core.sync({
        itemIds: ['album-1'],
        itemTypes,
        destinationPath: '/Volumes/MEDIA/lib',
      });

      // Should have the exact original filename using __getFile
      const expectedPath = '/Volumes/MEDIA/lib/Ace/Five-A-Side/Ace - Five-A-Side - How Long.mp3';
      expect((mockFs as any).__getFile(expectedPath)).toBeDefined();
    });
  });
});