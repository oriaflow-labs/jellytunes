# Jellyfin API - Guía de Endpoints para Descarga de Música

> **Proyecto:** Jellysync  
> **Fecha:** 2026-03-14  
> **Investigador:** Rastreator

---

## Índice

1. [Autenticación](#autenticación)
2. [Obtener Tracks de un Artista](#1-obtener-tracks-de-un-artista)
3. [Obtener Tracks de un Álbum](#2-obtener-tracks-de-un-álbuM)
4. [Obtener Tracks de una Playlist](#3-obtener-tracks-de-una-playlist)
5. [Descargar Archivo de Audio](#4-descargar-archivo-de-audio)
6. [Endpoints que NO Funcionan (Evitar)](#endpoints-que-no-funcionan-evitar)
7. [Ejemplos Completos](#ejemplos-completos)

---

## Autenticación

### Headers Requeridos

```http
X-MediaBrowser-Token: {apiKey}
```
o alternativamente:
```http
X-Emby-Token: {apiKey}
```

### Autenticación con Usuario/Contraseña

```http
POST /Users/AuthenticateByName
Content-Type: application/json

{
  "Username": "usuario",
  "Pw": "contraseña"
}
```

**Respuesta:** Devuelve un `AccessToken` y `User.Id` que se usan en requests posteriores.

---

## 1. Obtener Tracks de un Artista

### ⚠️ PROBLEMA CONOCIDO (Issue #6048)

Jellyfin tiene **dos IDs diferentes para el mismo artista**:
- ID desde `/Artists` → ID del artista como entidad
- ID desde álbumes (`AlbumArtistId`) → ID diferente para el mismo artista

**Esto hace que `/Items?artistIds=X` NO funcione correctamente.**

### ✅ ENDPOINT CORRECTO

**Obtener álbumes de un artista:**

```http
GET /Users/{userId}/Items?Recursive=true&IncludeItemTypes=MusicAlbum&AlbumArtistIds={artistId}&Fields=Path
```

**Parámetros importantes:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `Recursive` | `true` | Buscar en subcarpetas |
| `IncludeItemTypes` | `MusicAlbum` | Solo devolver álbumes |
| `AlbumArtistIds` | `{artistId}` | ID del artista (del campo `AlbumArtistId`, NO de `/Artists`) |
| `Fields` | `Path` | Incluir ruta del archivo |

### 📋 Ejemplo de Response

```json
{
  "Items": [
    {
      "Name": "Album Name",
      "Id": "album-uuid-here",
      "AlbumArtist": "Artist Name",
      "AlbumArtists": [
        {
          "Name": "Artist Name",
          "Id": "artist-uuid-here"
        }
      ],
      "Path": "/music/Artist/Album",
      "ProductionYear": 2023
    }
  ],
  "TotalRecordCount": 5
}
```

### 🔄 Flujo Completopara Obtener Todos los Tracks de un Artista

1. **Obtener el ID correcto del artista** (desde álbumes, NO desde `/Artists`)
2. **Buscar álbumes del artista:**
   ```http
   GET /Users/{userId}/Items?Recursive=true&IncludeItemTypes=MusicAlbum&AlbumArtistIds={artistId}&Fields=Path
   ```
3. **Para cada álbum, obtener sus tracks** (ver sección 2)

### ⚠️ NOTA IMPORTANTE: Dos Formas de Obtener el Artist ID

**Método A: Desde `/Artists` (NO recomendado)**
```http
GET /Artists?UserId={userId}&Fields=Genres,SortName
```
Problema: Este ID es DIFERENTE al que aparece en `AlbumArtists`.

**Método B: Desde álbumes existentes (RECOMENDADO)**
```http
GET /Users/{userId}/Items?Recursive=true&IncludeItemTypes=MusicAlbum&Fields=AlbumArtists
```
Luego extraer `AlbumArtists[0].Id` de cada álbum.

---

## 2. Obtener Tracks de un Álbum

### ✅ ENDPOINT CORRECTO

```http
GET /Users/{userId}/Items?ParentId={albumId}&IncludeItemTypes=Audio&Fields=Path,MediaSources
```

**Parámetros importantes:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `ParentId` | `{albumId}` | ID del álbum padre |
| `IncludeItemTypes` | `Audio` | Solo devolver tracks de audio |
| `Fields` | `Path,MediaSources` | Incluir ruta y fuentes de media |

### 📋 Ejemplo de Response

```json
{
  "Items": [
    {
      "Name": "Track Name",
      "Id": "track-uuid-here",
      "Path": "/music/Artist/Album/01 Track.flac",
      "IndexNumber": 1,
      "ParentIndexNumber": 1,
      "MediaSources": [
        {
          "Id": "media-source-id",
          "Path": "/music/Artist/Album/01 Track.flac",
          "Container": "flac",
          "Size": 35000000
        }
      ],
      "RunTimeTicks": 2400000000
    }
  ],
  "TotalRecordCount": 12
}
```

---

## 3. Obtener Tracks de una Playlist

### ✅ ENDPOINT CORRECTO (Recomendado)

```http
GET /Playlists/{playlistId}/Items?UserId={userId}&Fields=Path,MediaSources
```

### ✅ ENDPOINT ALTERNATIVO

```http
GET /Users/{userId}/Items?ParentId={playlistId}&IncludeItemTypes=Audio&Fields=Path,MediaSources
```

### 📋 Parámetros Adicionales

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `startIndex` | `0` | Índice inicial para paginación |
| `limit` | `100` | Máximo número de resultados |
| `Fields` | `Path,MediaSources` | Campos adicionales |
| `enableImages` | `false` | No incluir imágenes (más rápido) |
| `enableUserData` | `true` | Incluir datos de usuario |

---

## 4. Descargar Archivo de Audio

### ✅ OPCIÓN A: Descarga Directa (Recomendada para sincronización)

```http
GET /Items/{itemId}/Download?api_key={apiKey}
```

o con header:
```http
GET /Items/{itemId}/Download
X-MediaBrowser-Token: {apiKey}
```

**Ventajas:**
- Descarga el archivo original sin transcodificación
- Mantiene el formato y calidad original
- Ideal para sincronización offline

### ✅ OPCIÓN B: Stream Directo

```http
GET /Audio/{itemId}/stream?static=true&api_key={apiKey}
```

**Parámetros importantes:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `static` | `true` | Forzar stream directo sin transcodificación |
| `container` | `mp3,flac,m4a` | Contenedores aceptados |

### ✅ OPCIÓN C: Stream Universal (Más opciones)

```http
GET /Audio/{itemId}/universal?UserId={userId}&DeviceId={deviceId}&api_key={apiKey}&Container=opus,mp3,aac,flac&TranscodingContainer=ts&TranscodingProtocol=hls&AudioCodec=aac
```

**Parámetros importantes:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `Container` | `opus,mp3,aac,flac` | Contenedores soportados |
| `MaxStreamingBitrate` | `140000000` | Bitrate máximo |
| `AudioCodec` | `aac` | Codec de audio para transcodificación |
| `TranscodingContainer` | `ts` | Contenedor para transcodificación |
| `TranscodingProtocol` | `hls` | Protocolo de streaming |

### 📋 Obtener la URL del Archivo

```http
GET /Users/{userId}/Items?ids={itemId}&Fields=Path,MediaSources
```

En la respuesta, buscar:
```json
{
  "Items": [{
    "Path": "/music/Artist/Album/Track.flac",
    "MediaSources": [{
      "Path": "/music/Artist/Album/Track.flac",
      "Container": "flac"
    }]
  }]
}
```

---

## Endpoints que NO Funcionan (Evitar)

### ❌ `/Items?artistIds={artistId}`

**Problema:** Devuelve carpetas raíz de la biblioteca en lugar de álbumes del artista.
**Razón:** Jellyfin tiene IDs diferentes para artistas en `/Artists` vs `AlbumArtists`.

### ❌ `/Artists/{artistId}/Items`

**Problema:** No existe este endpoint. Usar `/Users/{userId}/Items` con filtros.

### ❌ Usar IDs de `/Artists` para buscar álbumes

**Problema:** Los IDs de `/Artists` son diferentes a los `AlbumArtistIds` que aparecen en los álbumes.
**Solución:** Usar `AlbumArtistIds` con IDs obtenidos de álbumes existentes.

---

## Ejemplos Completos

### Ejemplo 1: Obtener todos los tracks de un artista

```bash
# 1. Obtener ID del usuario autenticado (si no se conoce)
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Users"

# 2. Obtener álbumes del artista (usando AlbumArtistIds)
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Users/{userId}/Items?Recursive=true&IncludeItemTypes=MusicAlbum&AlbumArtistIds={artistId}&Fields=Path"

# 3. Para cada álbum ID, obtener sus tracks
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Users/{userId}/Items?ParentId={albumId}&IncludeItemTypes=Audio&Fields=Path,MediaSources"

# 4. Descargar cada track
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Items/{trackId}/Download" -o "track.flac"
```

### Ejemplo 2: Descargar una playlist completa

```bash
# 1. Obtener items de la playlist
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Playlists/{playlistId}/Items?UserId={userId}&Fields=Path,MediaSources"

# 2. Descargar cada track
for trackId in $(cat tracks.txt); do
  curl -H "X-MediaBrowser-Token: {apiKey}" \
    "{server}/Items/$trackId/Download" -o "$trackId.flac"
done
```

### Ejemplo 3: Stream de audio directo para reproducción

```bash
# URL directa para reproducción
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Audio/{trackId}/stream?static=true"

# O con contenedor específico
curl -H "X-MediaBrowser-Token: {apiKey}" \
  "{server}/Audio/{trackId}/stream.mp3?static=true"
```

---

## Resumen de Endpoints Funcionales

| Objetivo | Endpoint | Método |
|----------|----------|--------|
| Álbunes de artista | `/Users/{userId}/Items?AlbumArtistIds={id}&IncludeItemTypes=MusicAlbum` | GET |
| Tracks de álbum | `/Users/{userId}/Items?ParentId={albumId}&IncludeItemTypes=Audio` | GET |
| Tracks de playlist | `/Playlists/{playlistId}/Items` | GET |
| Descargar archivo | `/Items/{trackId}/Download` | GET |
| Stream directo | `/Audio/{trackId}/stream?static=true` | GET |
| Stream universal | `/Audio/{trackId}/universal` | GET |

---

## Notas Adicionales

### Paginación

Usar `startIndex` y `limit` para grandes colecciones:
```http
GET /Users/{userId}/Items?ParentId={albumId}&startIndex=0&limit=50
```

### Campos Útiles para `Fields`

- `Path` - Ruta del archivo
- `MediaSources` - Información de fuentes de media
- `Overview` - Descripción
- `Genres` - Géneros
- `ProviderIds` - IDs de proveedores externos (MusicBrainz, etc.)

### Tipos de Items (`IncludeItemTypes`)

- `Audio` - Tracks de audio
- `MusicAlbum` - Álbumes de música
- `MusicArtist` - Artistas
- `Playlist` - Playlists

### Filtros Útiles

- `albumArtistIds` - Filtrar por artista de álbum
- `albumIds` - Filtrar porálbum específico
- `genreIds` - Filtrar por género
- `years` - Filtrar por año

---

## Referencias

- [Jellyfin API Documentation](https://api.jellyfin.org/)
- [Jellyfin TypeScript SDK](https://typescript-sdk.jellyfin.org/)
- [Jellyfin API Overview (James Harvey)](https://jmshrv.com/posts/jellyfin-api/)
- [Issue #6048 - Artist ID mismatch](https://github.com/jellyfin/jellyfin/issues/6048)

---

*Documentación generada por Rastreator para Jellysync*