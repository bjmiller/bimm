import { type RefObject } from 'react';
import { useForm } from '@tanstack/react-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

interface SettingsProps {
  paneRef: RefObject<HTMLDivElement | null>;
}

export const Settings = ({ paneRef }: SettingsProps) => {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getSettings.queryOptions());
  const saveMutation = useMutation(trpc.settings.writeSettings.mutationOptions());
  const form = useForm({
    defaultValues: settings.data,

    onSubmit: async ({ value }) => {
      if (value != null) {
        await saveMutation.mutateAsync(value);
        await settings.refetch();
      }
    }
  });

  return (
    <div
      ref={paneRef}
      className="w-full p-1 outline-none"
      onMouseDownCapture={() => paneRef.current?.focus({ preventScroll: true })}
      tabIndex={0}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="directories">
          {(field) => {
            return (
              <>
                <h3>Music Directories</h3>
                <textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value?.join('\n')}
                  onChange={(e) => field.handleChange(e.target.value.split('\n'))}
                  className="h-16 w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
                />
              </>
            );
          }}
        </form.Field>

        <form.Field name="inbox">
          {(field) => {
            return (
              <>
                <h3 className="mt-2">Inbox Directory</h3>
                <input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="w-11/12 rounded-[3px] border border-neutral-700 p-1 text-sm text-[#3b3b3b]"
                />
              </>
            );
          }}
        </form.Field>

        <div>
          <button
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mt-2 inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 has-[>svg]:px-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
