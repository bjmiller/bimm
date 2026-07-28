import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { addTags, removeTag } from '../../lib/tags';
import { patchAlbumInQueryCaches } from '../lib/patchAlbumInQueryCaches';
import { type Album, type AlbumMetadata } from '../../types';
import { TagField } from './tagField';

interface TagEditorProps {
  album: Album;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}

type TagFieldName = keyof AlbumMetadata;

interface TagFieldDefinition {
  label: string;
  name: TagFieldName;
  placeholder: string;
}

// Ordered most- to least-authoritative, matching how `sortGenresByRelevance`
// weights the sources in the album list.
const TAG_FIELDS: TagFieldDefinition[] = [
  { label: 'Manual tags', name: 'manualTags', placeholder: '' },
  { label: 'Spotify genres', name: 'spotifyGenres', placeholder: '' },
  { label: 'Bandcamp tags', name: 'bandcampTags', placeholder: '' }
];

type TagState = Record<TagFieldName, string[]>;

const tagStateFrom = (album: Album): TagState => ({
  manualTags: album.manualTags ?? [],
  spotifyGenres: album.spotifyGenres ?? [],
  bandcampTags: album.bandcampTags ?? []
});

const BUTTON_CLASSES =
  'inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border ' +
  'border-neutral-400 bg-white px-4 py-2 text-xs font-medium whitespace-nowrap shadow-xs transition-all ' +
  'outline-none hover:bg-neutral-100 focus-visible:ring-[3px] focus-visible:ring-orange-400/50 ' +
  'active:bg-orange-400 disabled:pointer-events-none disabled:opacity-50';

/**
 * Modal for editing an album's three tag collections.
 *
 * The album is captured by the opener (see `albumList.tsx`) before the modal
 * takes focus, because moving focus out of the album list pane clears its row
 * focus. Local state is seeded once from that album so in-flight edits survive
 * the background `getAlbums` refetches.
 */
export const TagEditor = ({ album, onClose, onSaved }: TagEditorProps) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tags, setTags] = useState<TagState>(() => tagStateFrom(album));
  const [error, setError] = useState<string | undefined>(undefined);
  const writeAlbumTagsMutation = useMutation(trpc.file.writeAlbumTags.mutationOptions());
  const { isPending } = writeAlbumTagsMutation;

  const patchCaches = useCallback(
    (updatedAlbum: Album) => {
      patchAlbumInQueryCaches(
        queryClient,
        { albums: trpc.file.getAlbums.pathKey(), inbox: trpc.file.getInbox.pathKey() },
        updatedAlbum
      );
    },
    [queryClient, trpc]
  );

  // Capture the outgoing focus and move into the first tag input in one effect,
  // so ordering is deterministic. React's `autoFocus` prop is applied during
  // commit — before effects run — which would make `document.activeElement`
  // already be the modal's own input and break the restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });

    return () => {
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const addFieldTags = useCallback((field: TagFieldName, additions: string[]) => {
    if (additions.length === 0) {
      return;
    }

    setTags((previous) => ({ ...previous, [field]: addTags(previous[field], additions) }));
  }, []);

  const removeFieldTag = useCallback((field: TagFieldName, tag: string) => {
    setTags((previous) => ({ ...previous, [field]: removeTag(previous[field], tag) }));
  }, []);

  const handleSave = useCallback(() => {
    if (isPending) {
      return;
    }

    setError(undefined);
    // Dismiss immediately — the save continues in the background and the
    // caches are patched with the result when it lands.
    onClose();

    void (async () => {
      try {
        const updatedAlbum = await writeAlbumTagsMutation.mutateAsync({ albumPath: album.fullpath, tags });
        patchCaches(updatedAlbum);
        await onSaved?.();
      } catch (saveError) {
        // eslint-disable-next-line no-console
        console.error(saveError instanceof Error ? saveError.message : 'Unable to save tags.');
      }
    })();
  }, [album.fullpath, isPending, onClose, onSaved, patchCaches, tags, writeAlbumTagsMutation]);

  // Keeps Tab inside the modal. This also shadows the app-wide Tab/Shift+Tab
  // pane cycling: the dialog listener sits deeper in the DOM and stops
  // propagation, so focus can't land on a pane hidden behind the overlay.
  const trapTab = useCallback((direction: 'backward' | 'forward') => {
    const dialog = dialogRef.current;

    if (dialog == null) {
      return;
    }

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"])'));

    if (focusable.length === 0) {
      return;
    }

    const currentIndex = focusable.findIndex((element) => element === document.activeElement);
    const offset = direction === 'forward' ? 1 : -1;
    const nextIndex = (currentIndex + offset + focusable.length) % focusable.length;

    focusable[nextIndex]?.focus({ preventScroll: true });
  }, []);

  // `ignoreInputs: false` so these still fire while a tag input has focus.
  // `Mod+Enter` saves; plain Enter is reserved for committing a pending tag.
  useHotkeys(
    [
      { hotkey: 'Escape', callback: onClose },
      { hotkey: 'Mod+Enter', callback: handleSave },
      { hotkey: 'Tab', callback: () => trapTab('forward') },
      { hotkey: 'Shift+Tab', callback: () => trapTab('backward') }
    ],
    { ignoreInputs: false, preventDefault: true, target: dialogRef }
  );

  const handleBackdropMouseDown = useCallback(
    (mouseEvent: ReactMouseEvent<HTMLDivElement>) => {
      if (mouseEvent.target === mouseEvent.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit tags for ${album.filename}`}
        className="tag-editor flex max-h-full w-xl flex-col overflow-hidden rounded-md border border-neutral-500 bg-[#dfdfdf] shadow-lg outline-none"
      >
        <div className="border-b border-neutral-400 px-3 py-2">
          <h2 className="text-sm font-bold text-[#3b3b3b]">Edit tags</h2>
          <p className="truncate text-xs text-neutral-600" title={album.fullpath}>
            {album.filename}
          </p>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          {TAG_FIELDS.map((field) => (
            <TagField
              key={field.name}
              label={field.label}
              placeholder={field.placeholder}
              tags={tags[field.name]}
              onAddTags={(additions) => addFieldTags(field.name, additions)}
              onRemoveTag={(tag) => removeFieldTag(field.name, tag)}
            />
          ))}
        </div>

        {error != null && (
          <div className="mx-3 mb-1 rounded-[3px] bg-red-100 p-2 text-xs text-red-900" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-400 px-3 py-2">
          <button type="button" onClick={onClose} className={BUTTON_CLASSES}>
            Cancel
          </button>
          <button type="button" disabled={isPending} onClick={handleSave} className={BUTTON_CLASSES}>
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
