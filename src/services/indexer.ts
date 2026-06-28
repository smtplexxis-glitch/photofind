import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { describePhoto } from './claude';
import { savePhoto, isPhotoIndexed, getIndexedCount } from './db';

export interface IndexingProgress {
  total: number;
  processed: number;
  current: string;
  done: boolean;
  error?: string;
}

const BATCH_SIZE = 5;
const RESIZE_WIDTH = 512; // Small enough for fast API, large enough for accuracy

export async function startIndexing(
  onProgress: (p: IndexingProgress) => void,
  signal?: AbortSignal
) {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    onProgress({ total: 0, processed: 0, current: '', done: true, error: 'Нет доступа к галерее' });
    return;
  }

  // Get all photos
  let allAssets: MediaLibrary.Asset[] = [];
  let after: string | undefined;

  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: 500,
      after,
      sortBy: [['creationTime', false]],
    });
    allAssets = allAssets.concat(page.assets);
    if (!page.hasNextPage) break;
    after = page.endCursor;
    if (signal?.aborted) return;
  }

  const total = allAssets.length;
  let processed = 0;

  onProgress({ total, processed: 0, current: 'Подготовка...', done: false });

  // Process in batches
  for (let i = 0; i < allAssets.length; i += BATCH_SIZE) {
    if (signal?.aborted) return;

    const batch = allAssets.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (asset) => {
      if (signal?.aborted) return;

      try {
        // Skip already indexed
        const already = await isPhotoIndexed(asset.id);
        if (already) { processed++; return; }

        onProgress({ total, processed, current: asset.filename, done: false });

        // Resize + compress for API
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: RESIZE_WIDTH } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (!manipResult.base64) { processed++; return; }

        // Describe via Claude
        const result = await describePhoto(manipResult.base64);

        if (result.description) {
          await savePhoto({
            id: asset.id,
            uri: asset.uri,
            description: result.description,
            tags: result.tags,
            createdAt: asset.creationTime,
          });
        }

        processed++;
        onProgress({ total, processed, current: asset.filename, done: false });
      } catch (e) {
        processed++;
      }
    }));
  }

  onProgress({ total, processed, current: '', done: true });
}

export async function getGalleryTotal(): Promise<number> {
  const { status } = await MediaLibrary.getPermissionsAsync();
  if (status !== 'granted') return 0;
  const page = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 1 });
  return page.totalCount;
}
