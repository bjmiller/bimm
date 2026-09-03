import { useState, type RefObject } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { AppSettings } from '../../types';
import { logger } from '../lib/logger';

interface SettingsProps {
  paneRef: RefObject<HTMLDivElement | null>;
}

// The settings form is controlled from a single piece of local state, seeded
// once when the settings query first resolves. Later refetches never overwrite
// the draft, so what the inputs show is exactly what gets written on Save.
export const Settings = ({ paneRef }: SettingsProps) => {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getSettings.queryOptions());
  const saveMutation = useMutation(trpc.settings.writeSettings.mutationOptions());

  const [draft, setDraft] = useState<AppSettings | undefined>(undefined);

  // Seed the draft during render, the first time settings resolve. Seeding in
  // render (rather than an effect) satisfies the React Compiler lint rules;
  // guarding on `draft == null` ensures refetches never overwrite user edits.
  if (draft == null && settings.data != null) {
    const parsed = AppSettings.safeParse(settings.data);
    const loaded = parsed.success ? parsed.data : ({ home: '' } as AppSettings);

    // The New Album Target select shows directories[0] as a fallback when the
    // field is unset. Seed the draft with that displayed value so what you see
    // is what gets saved — otherwise the UI shows a directory the config file
    // doesn't contain, and F6 moves albums somewhere settings doesn't reflect.
    if ((loaded.newAlbumTargetDirectory == null || loaded.newAlbumTargetDirectory === '') && loaded.directories?.[0]) {
      setDraft({ ...loaded, newAlbumTargetDirectory: loaded.directories[0] });
    } else {
      setDraft(loaded);
    }
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => (prev == null ? prev : { ...prev, [key]: value }));
  };

  const directories = draft?.directories ?? [];

  // The select's options must include the current value, or the browser shows
  // the first option while the bound value stays unmatched — and clicking that
  // displayed option then fires no change event, so the draft never updates.
  // Ensure the persisted target is always selectable/changeable.
  const targetOptions =
    draft?.newAlbumTargetDirectory != null &&
    draft.newAlbumTargetDirectory !== '' &&
    !directories.includes(draft.newAlbumTargetDirectory)
      ? [draft.newAlbumTargetDirectory, ...directories]
      : directories;

  const onSave = async () => {
    if (draft == null) {
      return;
    }

    try {
      await saveMutation.mutateAsync(draft);
      await settings.refetch();
    } catch (saveError) {
      logger.error('Failed to save settings', saveError);
    }
  };

  return (
    <div
      ref={paneRef}
      className="settings flex h-lvh flex-auto flex-col p-1 outline-none"
      onMouseDownCapture={() => paneRef.current?.focus({ preventScroll: true })}
      tabIndex={0}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onSave();
        }}
      >
        <h3>Music Directories</h3>
        <textarea
          data-settings-tab-stop
          id="directories"
          name="directories"
          value={directories.join('\n')}
          onChange={(e) => update('directories', e.target.value.split('\n'))}
          className="h-16 w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
        />

        <h3 className="mt-2">Inbox Directory</h3>
        <input
          data-settings-tab-stop
          id="inbox"
          name="inbox"
          value={draft?.inbox ?? ''}
          onChange={(e) => update('inbox', e.target.value)}
          className="w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
        />

        <h3 className="mt-2">VLC Password</h3>
        <input
          data-settings-tab-stop
          id="vlcPassword"
          name="vlcPassword"
          value={draft?.vlcPassword ?? ''}
          onChange={(e) => update('vlcPassword', e.target.value)}
          className="w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
        />

        <h3 className="mt-2">Temp Directory</h3>
        <input
          data-settings-tab-stop
          id="tempDirectory"
          name="tempDirectory"
          value={draft?.tempDirectory ?? ''}
          placeholder={window.navigator.platform === 'Win32' ? '%TEMP%' : '/tmp'}
          onChange={(e) => update('tempDirectory', e.target.value || undefined)}
          className="w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
        />

        <h3 className="mt-2">New Album Target Directory</h3>
        <select
          data-settings-tab-stop
          id="newAlbumTargetDirectory"
          name="newAlbumTargetDirectory"
          value={draft?.newAlbumTargetDirectory ?? ''}
          onChange={(e) => update('newAlbumTargetDirectory', e.target.value || undefined)}
          className="w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
        >
          {targetOptions.map((dir) => (
            <option key={dir} value={dir}>
              {dir}
            </option>
          ))}
        </select>

        <div>
          <button
            data-settings-tab-stop
            type="submit"
            className="focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mt-2 inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none focus-visible:ring-[3px] active:bg-orange-400 disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
