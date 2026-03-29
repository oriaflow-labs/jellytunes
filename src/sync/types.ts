/**
 * JellyTunes Sync Module - Type Definitions
 * 
 * Core interfaces for the synchronization module.
 * These types define the public API contract.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Required configuration to connect to Jellyfin server
 */
export interface SyncConfig {
  /** Jellyfin server URL (e.g., 'https://jellyfin.example.com') */
  serverUrl: string;
  /** Jellyfin API key with appropriate permissions */
  apiKey: string;
  /** User ID for library access */
  userId: string;
  /** Server root path to strip from track paths (e.g., '/mediamusic/lib/lib/') */
  serverRootPath?: string;
}

/**
 * Validation result for SyncConfig
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// =============================================================================
// INPUT / OUTPUT
// =============================================================================

/**
 * Item type classification for sync operations
 */
export type ItemType = 'artist' | 'album' | 'playlist';

/**
 * Input for sync operation
 */
export interface SyncInput {
  /** IDs of items to sync (artists, albums, or playlists) */
  itemIds: string[];
  /** Map of item ID to its type for efficient lookup */
  itemTypes: Map<string, ItemType>;
  /** Destination path for synced files */
  destinationPath: string;
  /** Optional conversion settings */
  options?: SyncOptions;
}

/**
 * Destination filesystem type — used to apply compatibility sanitization
 */
export type FilesystemType = 'fat32' | 'exfat' | 'ntfs' | 'apfs' | 'hfs+' | 'ext4' | 'unknown';

/**
 * Optional sync behavior settings
 */
export interface SyncOptions {
  /** Convert FLAC to MP3 during sync */
  convertToMp3?: boolean;
  /** MP3 bitrate for conversion (ignored if convertToMp3 is false) */
  bitrate?: '128k' | '192k' | '320k';
  /** Skip existing files with same size */
  skipExisting?: boolean;
  /** Preserve folder structure (e.g., Artist/Album/Track) */
  preserveStructure?: boolean;
  /** Destination filesystem — enables compatibility sanitization for FAT32/exFAT/NTFS */
  filesystemType?: FilesystemType;
}

/**
 * Individual track information for sync
 */
export interface TrackInfo {
  /** Jellyfin track ID */
  id: string;
  /** Track name */
  name: string;
  /** Album name */
  album?: string;
  /** Artist name(s) */
  artists?: string[];
  /** Album artist */
  albumArtist?: string;
  /** Production year */
  year?: number;
  /** File path on Jellyfin server */
  path: string;
  /** Audio format (mp3, flac, m4a, etc.) */
  format: string;
  /** File size in bytes */
  size?: number;
  /** Bitrate in bits per second (e.g. 320000 for 320 kbps), as reported by Jellyfin */
  bitrate?: number;
  /** Track number */
  trackNumber?: number;
  /** Disc number */
  discNumber?: number;
}

// =============================================================================
// PROGRESS & EVENTS
// =============================================================================

/**
 * Sync phase enumeration
 */
export type SyncPhase = 'fetching' | 'copying' | 'converting' | 'validating' | 'complete' | 'cancelled' | 'error';

/**
 * Progress event data
 */
export interface SyncProgress {
  /** Current phase of sync operation */
  phase: SyncPhase;
  /** Current item number (1-indexed) */
  current: number;
  /** Total items to process */
  total: number;
  /** Currently processing track name */
  currentTrack?: string;
  /** Bytes processed so far */
  bytesProcessed?: number;
  /** Total bytes to process */
  totalBytes?: number;
  /** Error message if phase is 'error' */
  errorMessage?: string;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: SyncProgress) => void;

// =============================================================================
// RESULT
// =============================================================================

/**
 * Sync operation result
 */
export interface SyncResult {
  /** Whether sync completed successfully */
  success: boolean;
  /** Number of tracks successfully copied/converted */
  tracksCopied: number;
  /** Number of tracks skipped (already up-to-date on device) */
  tracksSkipped: number;
  /** Track IDs that failed to sync */
  tracksFailed: string[];
  /** Detailed error messages */
  errors: string[];
  /** Total size of files synced (bytes) */
  totalSizeBytes: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether sync was cancelled by user */
  cancelled?: boolean;
}

/**
 * Size estimation result
 */
export interface SizeEstimate {
  /** Total size in bytes */
  totalBytes: number;
  /** Number of tracks */
  trackCount: number;
  /** Breakdown by format */
  formatBreakdown: Map<string, number>;
  /** Breakdown by item type */
  typeBreakdown: Map<ItemType, number>;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Destination path validation result
 */
export interface DestinationValidation {
  /** Path is valid for writing */
  valid: boolean;
  /** Path exists */
  exists: boolean;
  /** Path is writable */
  writable: boolean;
  /** Available disk space in bytes */
  freeSpace?: number;
  /** Error messages if invalid */
  errors: string[];
}

// =============================================================================
// INTERNAL TYPES (for testing)
// =============================================================================

/**
 * Jellyfin API response for a track item
 * @internal
 */
export interface JellyfinTrackItem {
  Id: string;
  Name: string;
  AlbumName?: string;
  AlbumArtist?: string;
  Artists?: string[];
  Path?: string;
  MediaSources?: Array<{
    Path: string;
    Container?: string;
    Size?: number;
    Bitrate?: number;
  }>;
  IndexNumber?: number;
  ParentIndexNumber?: number;
}

/**
 * Jellyfin API response for an album
 * @internal
 */
export interface JellyfinAlbumItem {
  Id: string;
  Name: string;
  AlbumArtist?: string;
  ProductionYear?: number;
}

/**
 * Jellyfin API response for a playlist
 * @internal
 */
export interface JellyfinPlaylistItem {
  Id: string;
  Name: string;
  ChildCount?: number;
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Minimal logger interface for the sync module.
 * Injected as an optional dependency so the module stays testable without electron-log.
 */
export interface SyncLogger {
  info:  (msg: string) => void
  warn:  (msg: string) => void
  error: (msg: string) => void
  debug: (msg: string) => void
}

/**
 * Fetch result for tracks from various item types
 * @internal
 */
export interface FetchedTracks {
  tracks: TrackInfo[];
  sourceItemId: string;
  sourceItemType: ItemType;
  errors: string[];
}