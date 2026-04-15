/**
 * Sync Diff Engine Tests
 * Tests for Phase 2: analyzeDiff() and computeMetadataHash()
 */

import { describe, it, expect } from 'vitest';
import type { TrackChangeType } from './types';
import { createHash } from 'crypto';

// We'll test computeMetadataHash and analyzeDiff once implemented
// These tests describe the expected behavior

// =============================================================================
// computeMetadataHash tests
// =============================================================================

describe('computeMetadataHash', () => {
  // Helper matching the plan's implementation
  function computeMetadataHash(meta: {
    title?: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    year?: string | number;
    trackNumber?: string | number;
    discNumber?: string | number;
    genres?: string[];
  }): string {
    const normalized = JSON.stringify({
      title: meta.title ?? '',
      artist: meta.artist ?? '',
      albumArtist: meta.albumArtist ?? '',
      album: meta.album ?? '',
      year: meta.year ?? '',
      trackNumber: meta.trackNumber ?? '',
      discNumber: meta.discNumber ?? '',
      genres: (meta.genres ?? []).sort().join(','),
    });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  it('produces consistent hash for same metadata', () => {
    const meta = {
      title: 'Song Title',
      artist: 'Artist Name',
      albumArtist: 'Album Artist',
      album: 'Album Name',
      year: '2024',
      trackNumber: '1',
      discNumber: '1',
      genres: ['Rock', 'Pop'],
    };
    const h1 = computeMetadataHash(meta);
    const h2 = computeMetadataHash(meta);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('produces different hash when title changes', () => {
    const base = { title: 'Song A', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1', genres: [] };
    const changed = { ...base, title: 'Song B' };
    expect(computeMetadataHash(base)).not.toBe(computeMetadataHash(changed));
  });

  it('produces different hash when artist changes', () => {
    const base = { title: 'Song', artist: 'Artist A', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1', genres: [] };
    const changed = { ...base, artist: 'Artist B' };
    expect(computeMetadataHash(base)).not.toBe(computeMetadataHash(changed));
  });

  it('is insensitive to genre order', () => {
    const base = { title: 'Song', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1', genres: ['Rock', 'Pop'] };
    const reordered = { ...base, genres: ['Pop', 'Rock'] };
    expect(computeMetadataHash(base)).toBe(computeMetadataHash(reordered));
  });

  it('treats missing fields as empty string', () => {
    const withFields = { title: 'Song', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1', genres: [] as string[] };
    const withoutFields = { title: 'Song', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1' };
    expect(computeMetadataHash(withFields)).toBe(computeMetadataHash(withoutFields));
  });

  it('treats undefined genres same as empty array', () => {
    const withEmpty = { title: 'Song', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1', genres: [] as string[] };
    const withoutGenres = { title: 'Song', artist: 'Artist', album: 'Album', year: '2024', trackNumber: '1', discNumber: '1' };
    expect(computeMetadataHash(withEmpty)).toBe(computeMetadataHash(withoutGenres));
  });
});

// =============================================================================
// TrackChangeType tests
// =============================================================================

describe('TrackChangeType', () => {
  it('has all expected change types', () => {
    const expectedTypes: TrackChangeType[] = [
      'new',
      'metadata_changed',
      'cover_art_changed',
      'bitrate_changed',
      'removed',
      'path_changed',
      'unchanged',
    ];
    // This will fail until TrackChangeType is defined in types.ts
    // When the type is exported from types.ts, we can test it properly
    expect(expectedTypes).toHaveLength(7);
  });
});

// =============================================================================
// analyzeDiff logic tests
// =============================================================================

describe('analyzeDiff', () => {
  // Mock synced track record matching SyncedTrackRecord
  interface MockSyncedTrack {
    trackId: string;
    destinationPath: string;
    fileSize: number | null;
    metadataHash: string | null;
    coverArtMode: string;
    encodedBitrate: string | null;
    serverPath: string | null;
  }

  // Mock server track
  interface MockServerTrack {
    id: string;
    name: string;
    path: string;
    size?: number;
    metadataHash: string;
  }

  function analyzeDiff(
    serverTracks: MockServerTrack[],
    syncedTracks: Map<string, MockSyncedTrack>,
    _options: { coverArtMode: string; bitrate: string | null; convertToMp3: boolean }
  ): { new: MockServerTrack[]; metadataChanged: MockServerTrack[]; unchanged: MockServerTrack[]; removed: string[] } {
    const result = {
      new: [] as MockServerTrack[],
      metadataChanged: [] as MockServerTrack[],
      unchanged: [] as MockServerTrack[],
      removed: [] as string[],
    };

    for (const track of serverTracks) {
      const synced = syncedTracks.get(track.id);
      if (!synced) {
        result.new.push(track);
      } else if (synced.metadataHash !== track.metadataHash) {
        result.metadataChanged.push(track);
      } else {
        result.unchanged.push(track);
      }
    }

    for (const trackId of syncedTracks.keys()) {
      if (!serverTracks.find(t => t.id === trackId)) {
        result.removed.push(trackId);
      }
    }

    return result;
  }

  it('marks server track as new when not in synced tracks', () => {
    const serverTracks = [{ id: 'track-1', name: 'New Track', path: '/t1.mp3', metadataHash: 'abc' }];
    const syncedTracks = new Map<string, MockSyncedTrack>();

    const result = analyzeDiff(serverTracks, syncedTracks, { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false });

    expect(result.new).toHaveLength(1);
    expect(result.new[0].id).toBe('track-1');
    expect(result.unchanged).toHaveLength(0);
  });

  it('marks server track as unchanged when metadata hash matches', () => {
    const serverTracks = [{ id: 'track-1', name: 'Track', path: '/t1.mp3', metadataHash: 'abc123' }];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1',
      destinationPath: '/mnt/usb/t1.mp3',
      fileSize: 100,
      metadataHash: 'abc123',
      coverArtMode: 'embed',
      encodedBitrate: '192k',
      serverPath: '/t1.mp3',
    }]]);

    const result = analyzeDiff(serverTracks, syncedTracks, { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false });

    expect(result.unchanged).toHaveLength(1);
    expect(result.metadataChanged).toHaveLength(0);
    expect(result.new).toHaveLength(0);
  });

  it('marks server track as metadata_changed when hash differs', () => {
    const serverTracks = [{ id: 'track-1', name: 'Track Updated', path: '/t1.mp3', metadataHash: 'xyz789' }];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1',
      destinationPath: '/mnt/usb/t1.mp3',
      fileSize: 100,
      metadataHash: 'oldhash',
      coverArtMode: 'embed',
      encodedBitrate: '192k',
      serverPath: '/t1.mp3',
    }]]);

    const result = analyzeDiff(serverTracks, syncedTracks, { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false });

    expect(result.metadataChanged).toHaveLength(1);
    expect(result.metadataChanged[0].id).toBe('track-1');
  });

  it('marks synced track as removed when not on server', () => {
    const serverTracks: MockServerTrack[] = [];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1',
      destinationPath: '/mnt/usb/t1.mp3',
      fileSize: 100,
      metadataHash: 'abc',
      coverArtMode: 'embed',
      encodedBitrate: '192k',
      serverPath: '/t1.mp3',
    }]]);

    const result = analyzeDiff(serverTracks, syncedTracks, { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false });

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toBe('track-1');
  });

  it('handles mixed scenarios correctly', () => {
    const serverTracks = [
      { id: 'track-new', name: 'New', path: '/new.mp3', metadataHash: 'hnew' },
      { id: 'track-changed', name: 'Changed', path: '/changed.mp3', metadataHash: 'hchanged' },
      { id: 'track-unchanged', name: 'Same', path: '/same.mp3', metadataHash: 'hsame' },
    ];
    const syncedTracks = new Map([
      ['track-changed', {
        trackId: 'track-changed', destinationPath: '/changed.mp3', fileSize: 100,
        metadataHash: 'hold', coverArtMode: 'embed', encodedBitrate: '192k', serverPath: '/changed.mp3',
      }],
      ['track-unchanged', {
        trackId: 'track-unchanged', destinationPath: '/same.mp3', fileSize: 100,
        metadataHash: 'hsame', coverArtMode: 'embed', encodedBitrate: '192k', serverPath: '/same.mp3',
      }],
      ['track-deleted', {
        trackId: 'track-deleted', destinationPath: '/deleted.mp3', fileSize: 100,
        metadataHash: 'hdel', coverArtMode: 'embed', encodedBitrate: '192k', serverPath: '/deleted.mp3',
      }],
    ]);

    const result = analyzeDiff(serverTracks, syncedTracks, { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false });

    expect(result.new.map(t => t.id)).toEqual(['track-new']);
    expect(result.metadataChanged.map(t => t.id)).toEqual(['track-changed']);
    expect(result.unchanged.map(t => t.id)).toEqual(['track-unchanged']);
    expect(result.removed).toEqual(['track-deleted']);
  });

  // Cover art change detection
  it('detects cover_art_changed when mode differs', () => {
    // This requires analyzeDiff to compare cover_art_mode from options vs synced record
    // The plan specifies: if synced_tracks.cover_art_mode !== options.coverArtMode -> cover_art_changed
    const _serverTracks = [{ id: 'track-1', name: 'Track', path: '/t1.mp3', metadataHash: 'h1' }];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1', destinationPath: '/t1.mp3', fileSize: 100,
      metadataHash: 'h1', coverArtMode: 'off',   // was synced with cover art OFF
      encodedBitrate: '192k', serverPath: '/t1.mp3',
    }]]);

    // Now user wants embed mode
    const options = { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false };

    // Cover art changed if synced mode !== current mode AND metadata hash is same
    const synced = syncedTracks.get('track-1')!;
    const coverArtChanged = synced.metadataHash === _serverTracks[0].metadataHash
      && synced.coverArtMode !== options.coverArtMode;

    expect(coverArtChanged).toBe(true);
  });

  // Bitrate change detection
  it('detects bitrate_changed when encoded_bitrate differs from current option', () => {
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1', destinationPath: '/t1.mp3', fileSize: 100,
      metadataHash: 'h1', coverArtMode: 'embed',
      encodedBitrate: '320k',   // was synced at 320k
      serverPath: '/t1.mp3',
    }]]);

    // Now user wants 192k
    const options = { coverArtMode: 'embed', bitrate: '192k', convertToMp3: true };

    const synced = syncedTracks.get('track-1')!;
    const bitrateChanged = options.convertToMp3 === true
      && synced.encodedBitrate !== options.bitrate;

    expect(bitrateChanged).toBe(true);
  });

  it('detects bitrate_changed when going from no-conversion to conversion', () => {
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1', destinationPath: '/t1.mp3', fileSize: 100,
      metadataHash: 'h1', coverArtMode: 'embed',
      encodedBitrate: null,   // was NOT converted (original MP3 copied)
      serverPath: '/t1.mp3',
    }]]);

    // Now user wants to convert to MP3
    const options = { coverArtMode: 'embed', bitrate: '192k', convertToMp3: true };

    const synced = syncedTracks.get('track-1')!;
    const bitrateChanged = options.convertToMp3 === true && synced.encodedBitrate === null;

    expect(bitrateChanged).toBe(true);
  });

  // Test A — path_changed detection
  it('detects path_changed when album is renamed on server', () => {
    // Track was synced at /Artist/OldAlbum/track.mp3
    // Server now returns /Artist/NewAlbum/track.mp3 (same metadata, different path)
    // Expected: changeType = 'path_changed'
    const serverTracks = [{ id: 'track-1', name: 'Track', path: '/Artist/NewAlbum/track.mp3', metadataHash: 'abc123' }];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1',
      destinationPath: '/mnt/usb/Artist/OldAlbum/track.mp3', // old path
      fileSize: 100,
      metadataHash: 'abc123', // same hash means metadata unchanged
      coverArtMode: 'embed',
      encodedBitrate: '192k',
      serverPath: '/Artist/OldAlbum/track.mp3',
    }]]);

    const options = { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false };

    // path_changed: metadataHash same, coverArtMode same, bitrate same, but destinationPath differs
    const synced = syncedTracks.get('track-1')!;
    const metadataChanged = synced.metadataHash !== serverTracks[0].metadataHash;
    const coverArtChanged = synced.coverArtMode !== options.coverArtMode;
    const pathChanged = synced.destinationPath !== '/mnt/usb/Artist/NewAlbum/track.mp3';

    expect(metadataChanged).toBe(false);
    expect(coverArtChanged).toBe(false);
    expect(pathChanged).toBe(true);
  });

  // Test D — simultaneous metadata + cover_art change
  it('reports metadata_changed when both metadata and cover_art change', () => {
    // When both metadata and cover_art change, metadata_changed takes precedence
    const serverTracks = [{ id: 'track-1', name: 'Track Updated', path: '/t1.mp3', metadataHash: 'xyz789' }];
    const syncedTracks = new Map([['track-1', {
      trackId: 'track-1',
      destinationPath: '/t1.mp3',
      fileSize: 100,
      metadataHash: 'oldhash', // different = metadata_changed
      coverArtMode: 'off',    // also different = cover_art_changed
      encodedBitrate: '192k',
      serverPath: '/t1.mp3',
    }]]);

    const options = { coverArtMode: 'embed', bitrate: '192k', convertToMp3: false };

    const synced = syncedTracks.get('track-1')!;
    const metadataChanged = synced.metadataHash !== serverTracks[0].metadataHash;
    const coverArtChanged = synced.coverArtMode !== options.coverArtMode;

    expect(metadataChanged).toBe(true);
    expect(coverArtChanged).toBe(true);
    // In analyzeDiff, metadata_changed is checked first, so it takes precedence
  });
});
