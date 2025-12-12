import { useForm } from '@tanstack/react-form';
import { trpcReact } from '../lib/trpc';

export const Settings = () => {
  const settings = trpcReact.settings.getSettings.useQuery();
  const saveMutation = trpcReact.settings.writeSettings.useMutation();
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
    <div className="p-1 w-full">
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
                  className="border border-neutral-700 rounded-[3px] w-11/12 h-16 p-1 text-sm text-[#3b3b3b]"
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
                  className="border border-neutral-700 rounded-[3px] w-11/12 p-1 text-sm text-[#3b3b3b]"
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
            className="mt-2 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
