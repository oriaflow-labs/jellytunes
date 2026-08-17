import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MUSIC_ROOT = join(HERE, 'music');

/** Album Gamma is long white noise so a sync can be cancelled mid-flight (Task 7). */
export const TRACKS = [
  {
    dir: 'Test Artist A/Album Alpha',
    file: '01 - Alpha One.flac',
    title: 'Alpha One',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Alpha',
    file: '02 - Alpha Two.flac',
    title: 'Alpha Two',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 2,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Alpha',
    file: '03 - Alpha Three.flac',
    title: 'Alpha Three',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Alpha',
    track: 3,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Beta',
    file: '01 - Beta One.mp3',
    title: 'Beta One',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Beta',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Test Artist A/Album Beta',
    file: '02 - Beta Two.mp3',
    title: 'Beta Two',
    artist: 'Test Artist A',
    albumArtist: 'Test Artist A',
    album: 'Album Beta',
    track: 2,
    kind: 'sine',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '01 - Gamma One.flac',
    title: 'Gamma One',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 1,
    kind: 'noise',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '02 - Gamma Two.flac',
    title: 'Gamma Two',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 2,
    kind: 'noise',
  },
  {
    dir: 'Test Artist B/Album Gamma',
    file: '03 - Gamma Three.flac',
    title: 'Gamma Three',
    artist: 'Test Artist B',
    albumArtist: 'Test Artist B',
    album: null,
    track: 3,
    kind: 'noise',
  },
  {
    dir: 'Various Artists/Album Delta',
    file: '01 - Delta One.mp3',
    title: 'Delta One',
    artist: 'Test Artist A',
    albumArtist: 'Various Artists',
    album: 'Album Delta',
    track: 1,
    kind: 'sine',
  },
  {
    dir: 'Various Artists/Album Delta',
    file: '02 - Delta Two.mp3',
    title: 'Delta Two',
    artist: 'Test Artist C',
    albumArtist: 'Various Artists',
    album: 'Album Delta',
    track: 2,
    kind: 'sine',
  },
];

function sourceArgs(track, index) {
  // seed is fixed so white noise is byte-reproducible across runs
  return track.kind === 'noise'
    ? ['-f', 'lavfi', '-i', `anoisesrc=seed=${42 + index}:duration=120:sample_rate=44100`]
    : ['-f', 'lavfi', '-i', `sine=frequency=${220 + index * 20}:duration=2:sample_rate=44100`];
}

function encode(track, index) {
  const out = join(MUSIC_ROOT, track.dir, track.file);
  mkdirSync(dirname(out), { recursive: true });

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...sourceArgs(track, index),
    // -bitexact drops encoder/vendor strings, which otherwise vary by build
    '-bitexact',
    '-map_metadata',
    '-1',
    '-metadata',
    `title=${track.title}`,
    '-metadata',
    `artist=${track.artist}`,
    '-metadata',
    `album_artist=${track.albumArtist}`,
    '-metadata',
    `track=${track.track}`,
  ];

  // Album Gamma intentionally carries no ALBUM tag: it exercises the
  // AlbumId -> MusicAlbum resolution path the app relies on.
  if (track.album) args.push('-metadata', `album=${track.album}`);

  if (out.endsWith('.mp3')) args.push('-codec:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0');
  else args.push('-codec:a', 'flac', '-compression_level', '5');

  args.push(out);
  execFileSync(ffmpeg.path, args);
}

export function generate() {
  rmSync(MUSIC_ROOT, { recursive: true, force: true });
  TRACKS.forEach(encode);
  return MUSIC_ROOT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Generated ${TRACKS.length} tracks in ${generate()}`);
}
