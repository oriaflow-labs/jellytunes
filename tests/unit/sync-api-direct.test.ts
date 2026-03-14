/**
 * Direct integration test for sync module
 */
import { describe, it, expect } from 'vitest';

describe('Sync Module - Direct API Test', () => {
  it('should connect to Jellyfin and get tracks', async () => {
    // Dynamic import to ensure fresh module
    const { createApiClient } = await import('../../src/sync/sync-api.ts');
    
    const api = createApiClient({
      baseUrl: 'https://jellyfin.tjd-ds920.synology.me:8301',
      apiKey: '037cfc5660cd482ab0475d7afa6ae628',
      userId: '23ea021636224deeb6d8b761c7703b79',
      timeout: 15000
    });
    
    // Test connection
    const conn = await api.testConnection();
    console.log('Connection:', conn);
    
    // Get tracks for +44 artist
    const artistId = '551c6ed90ba9300212b42b522512f3bc';
    console.log('Fetching tracks for artist:', artistId);
    const tracks = await api.getArtistTracks(artistId);
    console.log('Tracks:', tracks.length);
    if (tracks.length > 0) {
      console.log('Sample:', tracks[0]);
    }
    
    expect(tracks.length).toBeGreaterThan(0);
  }, 60000);
});
