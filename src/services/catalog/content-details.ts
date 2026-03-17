import { stremioService } from '../stremioService';
import { mmkvStorage } from '../mmkvStorage';
import { TMDBService } from '../tmdbService';
import { logger } from '../../utils/logger';

import { convertMetaToStreamingContent, convertMetaToStreamingContentEnhanced } from './content-mappers';
import { addToRecentContent, createLibraryKey, type CatalogLibraryState } from './library';
import { DATA_SOURCE_KEY, DataSource, type StreamingContent } from './types';

export async function getDataSourcePreference(): Promise<DataSource> {
  try {
    const dataSource = await mmkvStorage.getItem(DATA_SOURCE_KEY);
    return (dataSource as DataSource) || DataSource.STREMIO_ADDONS;
  } catch (error) {
    logger.error('Failed to get data source preference:', error);
    return DataSource.STREMIO_ADDONS;
  }
}

export async function setDataSourcePreference(dataSource: DataSource): Promise<void> {
  try {
    await mmkvStorage.setItem(DATA_SOURCE_KEY, dataSource);
  } catch (error) {
    logger.error('Failed to set data source preference:', error);
  }
}

export async function getContentDetails(
  state: CatalogLibraryState,
  type: string,
  id: string,
  preferredAddonId?: string
): Promise<StreamingContent | null> {
  console.log('🔍 [CatalogService] getContentDetails called:', { type, id, preferredAddonId });

  try {
    let meta = null;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        console.log(`🔍 [CatalogService] Attempt ${attempt + 1}/2 for getContentDetails:`, { type, id, preferredAddonId });

        const isValidId = await stremioService.isValidContentId(type, id);
        console.log('🔍 [CatalogService] Content ID validation:', { type, id, isValidId });

        if (!isValidId) {
          console.log('🔍 [CatalogService] Invalid content ID, breaking retry loop');
          break;
        }

        console.log('🔍 [CatalogService] Calling stremioService.getMetaDetails:', { type, id, preferredAddonId });
        meta = await stremioService.getMetaDetails(type, id, preferredAddonId);
        console.log('🔍 [CatalogService] stremioService.getMetaDetails result:', {
          hasMeta: !!meta,
          metaId: meta?.id,
          metaName: meta?.name,
          metaType: meta?.type,
        });

        if (meta) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      } catch (error) {
        lastError = error;
        console.log(`🔍 [CatalogService] Attempt ${attempt + 1} failed:`, {
          errorMessage: error instanceof Error ? error.message : String(error),
          isAxiosError: (error as any)?.isAxiosError,
          responseStatus: (error as any)?.response?.status,
          responseData: (error as any)?.response?.data,
        });
        logger.error(`Attempt ${attempt + 1} failed to get content details for ${type}:${id}:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    if (meta) {
      console.log('🔍 [CatalogService] Meta found, converting to StreamingContent:', {
        metaId: meta.id,
        metaName: meta.name,
        metaType: meta.type,
      });

      const content = convertMetaToStreamingContentEnhanced(meta, state.library);
      addToRecentContent(state, content);
      content.inLibrary = state.library[createLibraryKey(type, id)] !== undefined;

      console.log('🔍 [CatalogService] Successfully converted meta to StreamingContent:', {
        contentId: content.id,
        contentName: content.name,
        contentType: content.type,
        inLibrary: content.inLibrary,
      });

      return content;
    }

    console.log('🔍 [CatalogService] No meta found, checking lastError:', {
      hasLastError: !!lastError,
      lastErrorMessage: lastError instanceof Error ? lastError.message : String(lastError),
    });

    if (lastError) {
      console.log('🔍 [CatalogService] Throwing lastError:', {
        errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
        isAxiosError: (lastError as any)?.isAxiosError,
        responseStatus: (lastError as any)?.response?.status,
      });
      throw lastError;
    }

    console.log('🔍 [CatalogService] No meta and no error, returning null');
    return null;
  } catch (error) {
    console.log('🔍 [CatalogService] getContentDetails caught error:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      isAxiosError: (error as any)?.isAxiosError,
      responseStatus: (error as any)?.response?.status,
      responseData: (error as any)?.response?.data,
    });
    logger.error(`Failed to get content details for ${type}:${id}:`, error);
    return null;
  }
}

export async function getEnhancedContentDetails(
  state: CatalogLibraryState,
  type: string,
  id: string,
  preferredAddonId?: string
): Promise<StreamingContent | null> {
  console.log('🔍 [CatalogService] getEnhancedContentDetails called:', { type, id, preferredAddonId });
  logger.log(`🔍 [MetadataScreen] Fetching enhanced metadata for ${type}:${id} ${preferredAddonId ? `from addon ${preferredAddonId}` : ''}`);

  try {
    const result = await getContentDetails(state, type, id, preferredAddonId);
    console.log('🔍 [CatalogService] getEnhancedContentDetails result:', {
      hasResult: !!result,
      resultId: result?.id,
      resultName: result?.name,
      resultType: result?.type,
    });
    return result;
  } catch (error) {
    console.log('🔍 [CatalogService] getEnhancedContentDetails error:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      isAxiosError: (error as any)?.isAxiosError,
      responseStatus: (error as any)?.response?.status,
      responseData: (error as any)?.response?.data,
    });
    throw error;
  }
}

export async function getBasicContentDetails(
  state: CatalogLibraryState,
  type: string,
  id: string,
  preferredAddonId?: string
): Promise<StreamingContent | null> {
  try {
    let meta = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (!(await stremioService.isValidContentId(type, id))) {
          break;
        }

        meta = await stremioService.getMetaDetails(type, id, preferredAddonId);
        if (meta) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      } catch (error) {
        lastError = error;
        logger.error(`Attempt ${attempt + 1} failed to get basic content details for ${type}:${id}:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    if (meta) {
      const content = convertMetaToStreamingContent(meta, state.library);
      content.inLibrary = state.library[createLibraryKey(type, id)] !== undefined;
      return content;
    }

    if (lastError) {
      throw lastError;
    }

    return null;
  } catch (error) {
    logger.error(`Failed to get basic content details for ${type}:${id}:`, error);
    return null;
  }
}

export async function getStremioId(type: string, tmdbId: string): Promise<string | null> {
  if (__DEV__) {
    console.log('=== CatalogService.getStremioId ===');
    console.log('Input type:', type);
    console.log('Input tmdbId:', tmdbId);
  }

  try {
    if (type === 'movie') {
      if (__DEV__) {
        console.log('Processing movie - fetching TMDB details...');
      }

      const movieDetails = await TMDBService.getInstance().getMovieDetails(tmdbId);

      if (__DEV__) {
        console.log('Movie details result:', {
          id: movieDetails?.id,
          title: movieDetails?.title,
          imdb_id: movieDetails?.imdb_id,
          hasImdbId: !!movieDetails?.imdb_id,
        });
      }

      if (movieDetails?.imdb_id) {
        if (__DEV__) {
          console.log('Successfully found IMDb ID:', movieDetails.imdb_id);
        }
        return movieDetails.imdb_id;
      }

      console.warn('No IMDb ID found for movie:', tmdbId);
      return null;
    }

    if (type === 'tv' || type === 'series') {
      if (__DEV__) {
        console.log('Processing TV show - fetching TMDB details for IMDb ID...');
      }

      const externalIds = await TMDBService.getInstance().getShowExternalIds(parseInt(tmdbId, 10));

      if (__DEV__) {
        console.log('TV show external IDs result:', {
          tmdbId,
          imdb_id: externalIds?.imdb_id,
          hasImdbId: !!externalIds?.imdb_id,
        });
      }

      if (externalIds?.imdb_id) {
        if (__DEV__) {
          console.log('Successfully found IMDb ID for TV show:', externalIds.imdb_id);
        }
        return externalIds.imdb_id;
      }

      console.warn('No IMDb ID found for TV show, falling back to kitsu format:', tmdbId);
      const fallbackId = `kitsu:${tmdbId}`;
      if (__DEV__) {
        console.log('Generated fallback Stremio ID for TV:', fallbackId);
      }
      return fallbackId;
    }

    console.warn('Unknown type provided:', type);
    return null;
  } catch (error: any) {
    if (__DEV__) {
      console.error('=== Error in getStremioId ===');
      console.error('Type:', type);
      console.error('TMDB ID:', tmdbId);
      console.error('Error details:', error);
      console.error('Error message:', error.message);
    }

    logger.error('Error getting Stremio ID:', error);
    return null;
  }
}
